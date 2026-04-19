const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const HUNTER_API_KEY = process.env.HUNTER_API_KEY || '';

// ── Lightweight analytics (no DB; flat files on Railway volume) ──
// Persists to DATA_DIR if set (mounted Railway volume), else local ./data.
// Two artifacts:
//   emails.jsonl   → append-only, one JSON record per signup
//   visitors.json  → set of hashed-IP+UA strings (unique-visitor count)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* ignore */ }
const EMAILS_FILE = path.join(DATA_DIR, 'emails.jsonl');
const VISITORS_FILE = path.join(DATA_DIR, 'visitors.json');

function loadVisitorSet() {
  try {
    const raw = fs.readFileSync(VISITORS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed.hashes) ? parsed.hashes : []);
  } catch (e) { return new Set(); }
}
let __visitorSet = loadVisitorSet();
function saveVisitorSet() {
  try { fs.writeFileSync(VISITORS_FILE, JSON.stringify({ hashes: [...__visitorSet] })); }
  catch (e) { console.error('visitor save failed:', e.message); }
}
function hashVisitor(ip, ua) {
  return crypto.createHash('sha256').update(String(ip || '') + '|' + String(ua || '')).digest('hex').slice(0, 16);
}

// Public visitor ticker — increments unique count, returns the running total.
const visitorLimiter = rateLimit({ windowMs: 10 * 1000, max: 5 });
app.post('/api/visit', visitorLimiter, (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  const ua = (req.headers['user-agent'] || '').toString();
  const h = hashVisitor(ip, ua);
  const fresh = !__visitorSet.has(h);
  if (fresh) {
    __visitorSet.add(h);
    saveVisitorSet();
  }
  res.json({ count: __visitorSet.size, fresh });
});

// Read-only counter (no write — used for the header ticker poll).
app.get('/api/visit-count', (req, res) => {
  res.json({ count: __visitorSet.size });
});

// Email capture — append to emails.jsonl. We do not de-dupe at write time so
// repeat submissions are still discoverable in audit logs; the admin endpoint
// dedupes at read time.
const emailLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
app.post('/api/capture-email', emailLimiter, (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return res.status(400).json({ ok: false, error: 'invalid email' });
  }
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  const ua = (req.headers['user-agent'] || '').toString();
  const record = {
    email,
    ts: new Date().toISOString(),
    ipHash: hashVisitor(ip, ''),  // store IP hash only, not raw IP
    uaHash: hashVisitor('', ua),
  };
  try {
    fs.appendFileSync(EMAILS_FILE, JSON.stringify(record) + '\n');
  } catch (e) {
    console.error('email capture write failed:', e.message);
    return res.status(500).json({ ok: false, error: 'write_failed' });
  }
  res.json({ ok: true });
});

// Admin readout — list captured emails. Behind ADMIN_TOKEN env var.
// curl -H "X-Admin-Token: <token>" /api/admin/emails
app.get('/api/admin/emails', (req, res) => {
  const required = process.env.ADMIN_TOKEN;
  if (!required) return res.status(503).json({ error: 'ADMIN_TOKEN not configured' });
  const provided = req.headers['x-admin-token'];
  if (provided !== required) return res.status(401).json({ error: 'unauthorized' });
  let lines = [];
  try { lines = fs.readFileSync(EMAILS_FILE, 'utf8').split('\n').filter(Boolean); }
  catch (e) { return res.json({ emails: [], total: 0 }); }
  const records = lines.map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  // De-dupe by email, keep earliest timestamp
  const seen = new Map();
  records.forEach(r => { if (!seen.has(r.email) || r.ts < seen.get(r.email).ts) seen.set(r.email, r); });
  const unique = [...seen.values()].sort((a, b) => b.ts.localeCompare(a.ts));
  res.json({ emails: unique, total: unique.length, totalSubmissions: records.length });
});

const hunterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many lookup requests. Try again in a minute.' }
});

app.get('/healthz', (req, res) => res.status(200).json({ ok: true, uptime: process.uptime() }));

// PDF magic bytes: `%PDF` at offset 0
function looksLikePdf(buf) {
  return buf && buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

// Server-side PDF text extraction
app.post('/api/extract-text', async (req, res) => {
  try {
    const { fileData, fileName } = req.body;
    if (!fileData) return res.status(400).json({ error: 'No file data' });

    const b64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const buf = Buffer.from(b64, 'base64');

    if (/\.pdf$/i.test(fileName)) {
      if (!looksLikePdf(buf)) {
        return res.status(400).json({ text: '', error: 'File does not appear to be a valid PDF (missing %PDF header).' });
      }
      try {
        const pdfjs = require('pdfjs-dist');
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
        let text = '';
        for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(' ') + '\n';
        }
        if (text.trim().length > 50) return res.json({ text: text.trim() });
      } catch (_) {}
    }

    if (/\.(txt|md|rtf)$/i.test(fileName)) {
      return res.json({ text: buf.toString('utf8') });
    }

    if (/\.(doc|docx)$/i.test(fileName)) {
      return res.json({ text: buf.toString('utf8').replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ') });
    }

    res.json({ text: '', error: 'Could not extract text' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Store last run time
let lastRunTime = new Date().toISOString();

app.get('/api/last-run', (req, res) => {
  res.json({ lastRun: lastRunTime });
});

app.post('/api/update-run', (req, res) => {
  lastRunTime = new Date().toISOString();
  res.json({ lastRun: lastRunTime });
});

app.get('/api/find-email', hunterLimiter, async (req, res) => {
  if (!HUNTER_API_KEY) return res.status(500).json({ error: 'HUNTER_API_KEY not configured' });
  const { firstName, lastName, domain } = req.query;
  try {
    const fetch = (await import('node-fetch')).default;
    const url = `https://api.hunter.io/v2/email-finder?first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.get('/api/domain-search', hunterLimiter, async (req, res) => {
  if (!HUNTER_API_KEY) return res.status(500).json({ error: 'HUNTER_API_KEY not configured' });
  const { domain } = req.query;
  try {
    const fetch = (await import('node-fetch')).default;
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}&limit=5&type=personal`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.json({ error: e.message });
  }
});

// Rank Hunter contacts toward hiring-manager / recruiter titles, away from
// CEO/founder/exec assistant noise. Returns the top 3 most-relevant people.
function rankHunterContacts(emails, jobTitle) {
  const jt = (jobTitle || '').toLowerCase();
  const score = (e) => {
    const pos = (e.position || '').toLowerCase();
    const dep = (e.department || '').toLowerCase();
    const sen = (e.seniority || '').toLowerCase();
    if (!pos && !dep) return -50; // skip empty rows
    let s = 0;
    // STRONG positive — actual hiring-side roles
    if (/\b(recruit|talent|hiring|people\s*ops|people\s*partner|head\s+of\s+people|people\s+team)\b/.test(pos)) s += 60;
    if (dep.includes('hr') || dep.includes('people')) s += 30;
    // Senior people who would interview but aren't C-suite founders
    if (/\b(head\s+of|director|vp|vice\s+president|svp|evp|principal|staff)\b/.test(pos)) s += 25;
    if (sen === 'senior' || sen === 'executive') s += 8;
    // Match the job's domain — prefer same-discipline manager (engineering manager
    // for an engineer role, marketing director for a PMM role, etc.)
    const jtTokens = jt.split(/[,\s/&]+/).filter(t => t.length >= 4);
    const overlap = jtTokens.filter(t => pos.includes(t)).length;
    s += overlap * 10;
    // NEGATIVE — generic exec assistants, founders, board members
    if (/\b(ceo|founder|co.?founder|chief\s+executive|owner|board|investor|chairman)\b/.test(pos)) s -= 30;
    if (/\b(executive\s+assistant|administrative\s+assistant|receptionist|office\s+manager)\b/.test(pos)) s -= 35;
    if (/\b(intern|coordinator|associate)\b/.test(pos) && !/recruit|talent|hiring/.test(pos)) s -= 5;
    // Dead emails / no verifiable contact
    if (e.confidence !== null && e.confidence !== undefined && e.confidence < 50) s -= 8;
    return s;
  };
  const ranked = (emails || [])
    .map(e => ({ ...e, _score: score(e) }))
    .filter(e => e._score > -20 && e.value)
    .sort((a, b) => b._score - a._score)
    .slice(0, 3);
  return ranked.map(e => ({
    name: [e.first_name, e.last_name].filter(Boolean).join(' ') || e.value.split('@')[0],
    role: e.position || e.department || '—',
    department: e.department || '',
    seniority: e.seniority || '',
    email: e.value,
    confidence: e.confidence,
    linkedin: e.linkedin,
    twitter: e.twitter,
  }));
}

// Returns ranked hiring-manager-preferring contacts for a given company domain.
app.get('/api/company-contacts', hunterLimiter, async (req, res) => {
  if (!HUNTER_API_KEY) return res.json({ contacts: [], error: 'no_key' });
  const { domain, jobTitle } = req.query;
  if (!domain) return res.json({ contacts: [] });
  try {
    const fetch = (await import('node-fetch')).default;
    // Pull a wider net (limit=20) than the legacy endpoint so we have something
    // to rank — Hunter's first 5 are usually whoever's most public, not the
    // hiring-side people we want.
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}&limit=20&type=personal`;
    const response = await fetch(url);
    const data = await response.json();
    const emails = (data && data.data && data.data.emails) || [];
    const contacts = rankHunterContacts(emails, jobTitle);
    res.json({ contacts, total: emails.length });
  } catch (e) {
    res.json({ contacts: [], error: e.message });
  }
});

// ── Find Jobs (real job search matched to resume) ──────────────────
let jobCache = { data: null, ts: 0 };
const CACHE_TTL = 30 * 60 * 1000;

// ── ATS Company Portals (all slugs verified working) ────────────
const ATS_COMPANIES = [
  // Greenhouse (verified 200)
  { slug: 'stripe', name: 'Stripe', platform: 'greenhouse', tags: ['fintech', 'payments', 'engineering', 'product', 'growth'] },
  { slug: 'figma', name: 'Figma', platform: 'greenhouse', tags: ['design', 'saas', 'engineering', 'product', 'growth'] },
  { slug: 'airtable', name: 'Airtable', platform: 'greenhouse', tags: ['productivity', 'saas', 'engineering', 'product', 'operations'] },
  { slug: 'webflow', name: 'Webflow', platform: 'greenhouse', tags: ['design', 'saas', 'engineering', 'marketing', 'product'] },
  { slug: 'vercel', name: 'Vercel', platform: 'greenhouse', tags: ['engineering', 'developer tools', 'product', 'growth', 'saas'] },
  { slug: 'airbnb', name: 'Airbnb', platform: 'greenhouse', tags: ['hospitality', 'travel', 'marketplace', 'community', 'product'] },
  { slug: 'pacaso', name: 'Pacaso', platform: 'greenhouse', tags: ['real estate', 'proptech', 'marketplace', 'operations', 'community'] },
  { slug: 'thumbtack', name: 'Thumbtack', platform: 'greenhouse', tags: ['marketplace', 'consumer', 'local', 'operations', 'growth'] },
  { slug: 'faire', name: 'Faire', platform: 'greenhouse', tags: ['marketplace', 'b2b', 'operations', 'logistics', 'growth'] },
  { slug: 'taskrabbit', name: 'TaskRabbit', platform: 'greenhouse', tags: ['marketplace', 'consumer', 'local', 'operations', 'community'] },
  { slug: 'duolingo', name: 'Duolingo', platform: 'greenhouse', tags: ['edtech', 'consumer', 'product', 'growth', 'community'] },
  { slug: 'nextdoor', name: 'Nextdoor', platform: 'greenhouse', tags: ['social', 'local', 'community', 'consumer', 'growth'] },
  { slug: 'flexport', name: 'Flexport', platform: 'greenhouse', tags: ['logistics', 'supply chain', 'operations', 'b2b', 'growth'] },
  { slug: 'coinbase', name: 'Coinbase', platform: 'greenhouse', tags: ['fintech', 'engineering', 'product', 'operations', 'growth'] },
  { slug: 'dropbox', name: 'Dropbox', platform: 'greenhouse', tags: ['productivity', 'saas', 'engineering', 'product', 'growth'] },
  { slug: 'gitlab', name: 'GitLab', platform: 'greenhouse', tags: ['developer tools', 'engineering', 'product', 'saas', 'operations'] },
  { slug: 'hubspot', name: 'HubSpot', platform: 'greenhouse', tags: ['saas', 'marketing', 'sales', 'product', 'growth'] },
  { slug: 'instacart', name: 'Instacart', platform: 'greenhouse', tags: ['marketplace', 'logistics', 'consumer', 'operations', 'growth'] },
  { slug: 'lyft', name: 'Lyft', platform: 'greenhouse', tags: ['marketplace', 'consumer', 'operations', 'product', 'community'] },
  { slug: 'mongodb', name: 'MongoDB', platform: 'greenhouse', tags: ['engineering', 'developer tools', 'saas', 'product', 'b2b'] },
  { slug: 'postman', name: 'Postman', platform: 'greenhouse', tags: ['developer tools', 'engineering', 'product', 'saas', 'b2b'] },
  { slug: 'reddit', name: 'Reddit', platform: 'greenhouse', tags: ['social', 'community', 'consumer', 'product', 'growth'] },
  { slug: 'robinhood', name: 'Robinhood', platform: 'greenhouse', tags: ['fintech', 'consumer', 'product', 'engineering', 'growth'] },
  { slug: 'twilio', name: 'Twilio', platform: 'greenhouse', tags: ['saas', 'engineering', 'product', 'b2b', 'developer tools'] },
  { slug: 'cloudflare', name: 'Cloudflare', platform: 'greenhouse', tags: ['engineering', 'saas', 'product', 'b2b', 'growth'] },
  { slug: 'databricks', name: 'Databricks', platform: 'greenhouse', tags: ['engineering', 'data', 'saas', 'product', 'b2b'] },
  { slug: 'datadog', name: 'Datadog', platform: 'greenhouse', tags: ['engineering', 'saas', 'product', 'b2b', 'operations'] },
  { slug: 'discord', name: 'Discord', platform: 'greenhouse', tags: ['social', 'community', 'consumer', 'product', 'engineering'] },
  { slug: 'intercom', name: 'Intercom', platform: 'greenhouse', tags: ['saas', 'customer success', 'product', 'b2b', 'growth'] },
  { slug: 'lattice', name: 'Lattice', platform: 'greenhouse', tags: ['hr tech', 'people operations', 'saas', 'product', 'b2b'] },
  { slug: 'linkedin', name: 'LinkedIn', platform: 'greenhouse', tags: ['social', 'saas', 'product', 'engineering', 'community'] },
  { slug: 'eventbriteinc', name: 'Eventbrite', platform: 'greenhouse', tags: ['events', 'marketplace', 'community', 'consumer', 'operations'] },
  // Ashby (verified 200)
  { slug: 'kindred', name: 'Kindred', platform: 'ashby', tags: ['coliving', 'community', 'hospitality', 'real estate', 'operations'] },
  { slug: 'ramp', name: 'Ramp', platform: 'ashby', tags: ['fintech', 'saas', 'b2b', 'engineering', 'growth'] },
  { slug: 'watershed', name: 'Watershed', platform: 'ashby', tags: ['sustainability', 'esg', 'climate', 'saas', 'engineering'] },
  { slug: 'opensea', name: 'OpenSea', platform: 'ashby', tags: ['marketplace', 'engineering', 'product', 'consumer', 'community'] },
  { slug: 'assembly', name: 'Assembly', platform: 'ashby', tags: ['hr tech', 'people operations', 'saas', 'community', 'product'] },
  { slug: 'notion', name: 'Notion', platform: 'ashby', tags: ['productivity', 'saas', 'engineering', 'design', 'product'] },
  { slug: 'linear', name: 'Linear', platform: 'ashby', tags: ['developer tools', 'saas', 'engineering', 'product', 'design'] },
  { slug: 'retool', name: 'Retool', platform: 'ashby', tags: ['developer tools', 'saas', 'engineering', 'product', 'b2b'] },
  { slug: 'loom', name: 'Loom', platform: 'ashby', tags: ['productivity', 'saas', 'engineering', 'product', 'growth'] },
  { slug: 'clipboard', name: 'Clipboard Health', platform: 'ashby', tags: ['healthcare', 'marketplace', 'operations', 'growth', 'community'] },
  { slug: 'plaid', name: 'Plaid', platform: 'ashby', tags: ['fintech', 'engineering', 'product', 'b2b', 'developer tools'] },
  { slug: 'bumble', name: 'Bumble', platform: 'ashby', tags: ['consumer', 'social', 'community', 'product', 'growth'] },
  // Hardware / semiconductor / AI-compute (Greenhouse, verified 200) — added 2026-04-18
  // to give EE / semiconductor / data-center resumes in-field candidates.
  { slug: 'sambanovasystems', name: 'SambaNova Systems', platform: 'greenhouse', tags: ['hardware', 'semiconductor', 'ai', 'data center', 'engineering', 'electrical'] },
  { slug: 'tenstorrent', name: 'Tenstorrent', platform: 'greenhouse', tags: ['hardware', 'semiconductor', 'chip', 'ai', 'engineering', 'electrical'] },
  { slug: 'anthropic', name: 'Anthropic', platform: 'greenhouse', tags: ['ai', 'ml', 'research', 'engineering', 'data center', 'hardware'] },
  { slug: 'asteralabs', name: 'Astera Labs', platform: 'greenhouse', tags: ['hardware', 'semiconductor', 'chip', 'data center', 'cloud infrastructure', 'electrical'] },
  { slug: 'cerebrassystems', name: 'Cerebras Systems', platform: 'greenhouse', tags: ['hardware', 'semiconductor', 'chip', 'ai', 'engineering', 'electrical'] },
  { slug: 'lightmatter', name: 'Lightmatter', platform: 'greenhouse', tags: ['hardware', 'semiconductor', 'chip', 'photonics', 'engineering', 'electrical'] },
  { slug: 'psiquantum', name: 'PsiQuantum', platform: 'greenhouse', tags: ['hardware', 'quantum', 'research', 'engineering', 'electrical'] },
  { slug: 'ionq', name: 'IonQ', platform: 'greenhouse', tags: ['hardware', 'quantum', 'research', 'engineering', 'electrical'] },
];

// Ghost-job layoff signal removed 2026-04-18: the hardcoded RECENT_LAYOFFS
// array decayed as its 2025 dates fell out of the 6-month window, producing
// a silently-dead signal. Ghost risk is now based on freshness + reposts only.
// A future owner-approved reintroduction could wire a live source (layoffs.fyi)
// with a short TTL cache. See handoff docs §7.2 [B10].

function selectCompaniesForResume(keywords) {
  const allKw = [
    ...keywords.titles,
    ...keywords.domainSkills,
    ...keywords.specificWords.slice(0, 20),
    ...keywords.specificBigrams.slice(0, 10)
  ].map(k => k.toLowerCase());

  const scored = ATS_COMPANIES.map(c => {
    let score = 0;
    c.tags.forEach(tag => {
      const tagWords = tag.split(/\s+/);
      if (allKw.some(kw => kw.includes(tag) || tag.includes(kw))) score += 3;
      else if (tagWords.some(tw => allKw.some(kw => kw.includes(tw) || tw.includes(kw)))) score += 1;
    });
    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 15);
}

async function fetchATSJobs(companies, keywords) {
  const fetch = (await import('node-fetch')).default;
  const results = [];
  const titleTerms = [
    ...keywords.titles,
    ...keywords.domainSkills.slice(0, 10)
  ].map(t => t.toLowerCase());

  // 2026-04-18 [B4]: removed broad `isTitleRelevant` pre-filter; it matched
  // ~95% of corporate titles (no-op) and obscured the trust boundary between
  // fetching and scoring. scoreFit carries the full filtering weight now.

  // Process in batches of 10 concurrent
  for (let i = 0; i < companies.length; i += 10) {
    const batch = companies.slice(i, i + 10);
    const fetches = batch.map(async (co) => {
      try {
        let url, parseJobs;
        if (co.platform === 'greenhouse') {
          url = `https://boards-api.greenhouse.io/v1/boards/${co.slug}/jobs`;
          parseJobs = (data) => {
            return (data.jobs || []).map(j => {
              const d = j.updated_at ? new Date(j.updated_at) : null;
              return {
                id: `gh-${co.slug}-${j.id}`,
                title: j.title || '',
                company: co.name,
                location: (j.location && j.location.name) || 'Unknown',
                remote: /remote/i.test((j.location && j.location.name) || ''),
                url: j.absolute_url || '',
                logo: '',
                salary: '',
                postedDate: d,
                posted: d ? timeAgo(d) : '',
                type: 'Full-time',
                description: '',
                tags: co.tags || [],
                source: 'Greenhouse'
              };
            });
          };
        } else if (co.platform === 'ashby') {
          url = `https://api.ashbyhq.com/posting-api/job-board/${co.slug}`;
          parseJobs = (data) => {
            return (data.jobs || []).map(j => {
              const d = j.publishedAt ? new Date(j.publishedAt) : null;
              return {
                id: `ab-${co.slug}-${j.id || Math.random().toString(36).slice(2)}`,
                title: j.title || '',
                company: co.name,
                location: j.location || 'Unknown',
                remote: /remote/i.test(j.location || ''),
                url: j.jobUrl || '',
                logo: '',
                salary: '',
                postedDate: d,
                posted: d ? timeAgo(d) : '',
                type: 'Full-time',
                description: (j.descriptionPlain || '').substring(0, 1500),
                tags: co.tags || [],
                source: 'Ashby'
              };
            });
          };
        } else if (co.platform === 'lever') {
          url = `https://api.lever.co/v0/postings/${co.slug}`;
          parseJobs = (data) => {
            if (!Array.isArray(data)) return [];
            return data.map(j => {
              const d = j.createdAt ? new Date(j.createdAt) : null;
              return {
                id: `lv-${co.slug}-${j.id || Math.random().toString(36).slice(2)}`,
                title: j.text || '',
                company: co.name,
                location: (j.categories && j.categories.location) || 'Unknown',
                remote: /remote/i.test((j.categories && j.categories.location) || ''),
                url: j.hostedUrl || '',
                logo: '',
                salary: '',
                postedDate: d,
                posted: d ? timeAgo(d) : '',
                type: 'Full-time',
                description: (j.descriptionPlain || '').substring(0, 1500),
                tags: co.tags || [],
                source: 'Lever'
              };
            });
          };
        } else {
          return;
        }

        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) return;
        const data = await r.json();
        const jobs = parseJobs(data);
        results.push(...jobs);
      } catch (e) {
        console.error(`ATS ${co.platform}/${co.slug}:`, e.message);
      }
    });
    await Promise.all(fetches);
  }

  console.log('Fetched', results.length, 'relevant ATS jobs from', companies.length, 'portals');
  return results;
}

app.post('/api/find-jobs', async (req, res) => {
  try {
    const { resumeText, location } = req.body;
    if (!resumeText) return res.status(400).json({ error: 'No resume text' });

    const keywords = extractResumeKeywords(resumeText);

    // Fetch general APIs + ATS portals in parallel
    const selectedCompanies = selectCompaniesForResume(keywords);
    console.log('ATS: scanning', selectedCompanies.length, 'companies:', selectedCompanies.map(c => c.name).join(', '));
    const [generalJobs, atsJobs] = await Promise.all([
      fetchAllJobs(),
      fetchATSJobs(selectedCompanies, keywords).catch(e => { console.error('ATS scan error:', e.message); return []; })
    ]);
    console.log('Found', generalJobs.length, 'general +', atsJobs.length, 'ATS jobs');

    // Merge and deduplicate
    const merged = [...generalJobs, ...atsJobs];
    const seen = new Set();
    const allJobs = merged.filter(j => {
      const key = (j.title + '|' + j.company).toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let scored = allJobs
      .map(job => ({
        ...job,
        fit: scoreFit(job, keywords),
        matchedTerms: matchedTermsForJob(job, keywords)
      }))
      .sort((a, b) => b.fit - a.fit);

    // Filter out clearly non-English-market jobs from all results
    scored = scored.filter(j => {
      if (!isAllowedMarketLocation(j.location)) return false;
      if (!isAllowedMarketTitle(j.title)) return false;
      return true;
    });

    if (location === 'remote') {
      scored = scored.filter(j => {
        const loc = (j.location || '').toLowerCase();
        return /remote/i.test(loc) || j.remote;
      });
    } else if (location === 'austin') {
      scored = scored.filter(j => /austin/i.test(j.location || ''));
    }

    // Only show jobs with meaningful relevance (40%+ fit)
    scored = scored.filter(j => j.fit >= 40);
    const top = scored.slice(0, 40);
    // Score-based tiers matching stat card labels
    top.forEach((j, i) => {
      if (j.fit >= 75) j.tier = 'hot';
      else if (j.fit >= 60) j.tier = 'strong';
      else j.tier = 'good';
      j.color = j.tier === 'hot' ? 'g' : j.tier === 'strong' ? 'b' : 'y';
      j.title = String(j.title || '');
      j.company = String(j.company || 'Unknown');
      j.location = String(j.location || '');
      j.salary = String(j.salary || '');
      j.posted = String(j.posted || '');
      j.type = String(j.type || 'Full-time');
      j.url = String(j.url || '');
      j.logo = String(j.logo || '');
      j.description = String(j.description || '');
      j.source = String(j.source || '');
      j.tags = Array.isArray(j.tags) ? j.tags.map(String) : [];

      // Ghost detection fields — prefer real Date, fall back to parseDaysAgo
      j.daysAgo = daysAgoFromJob(j);
      if (j.daysAgo === null) j.freshness = 'unknown';
      else if (j.daysAgo <= 7) j.freshness = 'fresh';
      else if (j.daysAgo <= 14) j.freshness = 'normal';
      else if (j.daysAgo <= 30) j.freshness = 'aging';
      else j.freshness = 'stale';

      j.layoffSignal = false; // [B10] removed 2026-04-18; see note above
    });

    // Repost detection: group by company, flag if same company appears 2+ times
    const companyCount = {};
    top.forEach(j => {
      const co = (j.company || '').toLowerCase();
      companyCount[co] = (companyCount[co] || 0) + 1;
    });
    top.forEach(j => {
      const co = (j.company || '').toLowerCase();
      j.reposted = companyCount[co] >= 2;
    });

    // Ghost risk assessment (freshness + reposts only; layoff signal removed)
    top.forEach(j => {
      let signals = 0;
      const reasons = [];
      if (j.freshness === 'stale') {
        signals += 2;
        reasons.push(`posted ${j.daysAgo}d ago`);
      } else if (j.freshness === 'aging') {
        signals += 1;
        reasons.push(`posted ${j.daysAgo}d ago`);
      }
      if (j.reposted) {
        signals++;
        reasons.push(`${j.company} has multiple open reqs`);
      }
      j.ghostRisk = signals === 0 ? 'low' : signals === 1 ? 'medium' : 'high';
      j.ghostRiskReason = reasons.join(' · ') || 'fresh posting, single req';
      j.ghostRiskReasons = reasons.length ? reasons : ['Fresh posting, single open req'];
    });

    res.json({ jobs: top, keywords: keywords.titles.concat(keywords.domainSkills).slice(0, 10) });
  } catch (e) {
    console.error('Find jobs error:', e);
    res.status(500).json({ error: e.message });
  }
});

async function fetchAllJobs() {
  if (jobCache.data && Date.now() - jobCache.ts < CACHE_TTL) return jobCache.data;
  const fetch = (await import('node-fetch')).default;
  const results = [];

  const fetches = [
    // RemoteOK
    (async () => {
      try {
        const r = await fetch('https://remoteok.com/api', {
          headers: { 'User-Agent': 'YourJobBoard/1.0' }, signal: AbortSignal.timeout(10000)
        });
        const data = await r.json();
        data.slice(1).forEach(j => {
          if (!j.position) return;
          const d = j.date ? new Date(j.date) : null;
          results.push({
            id: 'rok-' + (j.id || j.slug), title: j.position, company: j.company || 'Unknown',
            location: j.location || 'Remote', remote: true,
            url: j.url || ('https://remoteok.com/remote-jobs/' + j.slug),
            logo: j.company_logo || j.logo || '',
            salary: j.salary_min && j.salary_max ? '$' + Math.round(j.salary_min / 1000) + 'k\u2013$' + Math.round(j.salary_max / 1000) + 'k' : '',
            postedDate: d, posted: d ? timeAgo(d) : '', type: 'Full-time',
            description: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 1500),
            tags: j.tags || [], source: 'RemoteOK'
          });
        });
      } catch (e) { console.error('RemoteOK:', e.message); }
    })(),

    // Arbeitnow
    (async () => {
      try {
        const r = await fetch('https://www.arbeitnow.com/api/job-board-api', { signal: AbortSignal.timeout(10000) });
        const data = await r.json();
        (data.data || []).forEach(j => {
          const d = j.created_at ? new Date(j.created_at * 1000) : null;
          results.push({
            id: 'abn-' + j.slug, title: j.title, company: j.company_name || 'Unknown',
            location: j.location || (j.remote ? 'Remote' : ''), remote: !!j.remote,
            url: j.url, logo: '', salary: '',
            postedDate: d, posted: d ? timeAgo(d) : '', type: (j.job_types || []).join(', ') || 'Full-time',
            description: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 1500),
            tags: j.tags || [], source: 'Arbeitnow'
          });
        });
      } catch (e) { console.error('Arbeitnow:', e.message); }
    })(),

    // Jobicy
    (async () => {
      try {
        const r = await fetch('https://jobicy.com/api/v2/remote-jobs?count=50', { signal: AbortSignal.timeout(10000) });
        const data = await r.json();
        (data.jobs || []).forEach(j => {
          const d = j.pubDate ? new Date(j.pubDate) : null;
          results.push({
            id: 'jcy-' + j.id, title: j.jobTitle, company: j.companyName || 'Unknown',
            location: j.jobGeo || 'Remote', remote: true,
            url: j.url, logo: j.companyLogo || '', salary: j.annualSalaryMin && j.annualSalaryMax ? '$' + Math.round(j.annualSalaryMin / 1000) + 'k\u2013$' + Math.round(j.annualSalaryMax / 1000) + 'k' : '',
            postedDate: d, posted: d ? timeAgo(d) : '', type: j.jobType || 'Full-time',
            description: (j.jobDescription || '').replace(/<[^>]+>/g, '').substring(0, 1500),
            tags: [], source: 'Jobicy'
          });
        });
      } catch (e) { console.error('Jobicy:', e.message); }
    })(),

    // Remotive
    (async () => {
      try {
        const r = await fetch('https://remotive.com/api/remote-jobs?limit=100', { signal: AbortSignal.timeout(10000) });
        const data = await r.json();
        (data.jobs || []).forEach(j => {
          const d = j.publication_date ? new Date(j.publication_date) : null;
          results.push({
            id: 'rmt-' + j.id, title: j.title, company: j.company_name || 'Unknown',
            location: j.candidate_required_location || 'Remote', remote: true,
            url: j.url, logo: j.company_logo_url || j.company_logo || '',
            salary: j.salary || '',
            postedDate: d, posted: d ? timeAgo(d) : '',
            type: j.job_type || 'Full-time',
            description: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 1500),
            tags: j.tags || [], source: 'Remotive',
            category: j.category || ''
          });
        });
      } catch (e) { console.error('Remotive:', e.message); }
    })(),

    // The Muse (broader categories: business ops, PM, marketing, etc.)
    (async () => {
      try {
        const categories = ['Business%20Operations', 'Project%20Management', 'Marketing%20%26%20PR', 'Customer%20Service', 'Sales'];
        for (const cat of categories) {
          try {
            const r = await fetch(`https://www.themuse.com/api/public/jobs?category=${cat}&page=0`, { signal: AbortSignal.timeout(8000) });
            const data = await r.json();
            (data.results || []).forEach(j => {
              const loc = (j.locations || []).map(l => l.name).join(', ') || 'Various';
              const d = j.publication_date ? new Date(j.publication_date) : null;
              results.push({
                id: 'muse-' + j.id, title: j.name, company: (j.company || {}).name || 'Unknown',
                location: loc, remote: loc.toLowerCase().includes('remote'),
                url: j.refs && j.refs.landing_page ? j.refs.landing_page : '',
                logo: '', salary: '',
                postedDate: d, posted: d ? timeAgo(d) : '',
                type: (j.levels || []).map(l => l.name).join(', ') || 'Full-time',
                description: (j.contents || '').replace(/<[^>]+>/g, '').substring(0, 1500),
                tags: (j.categories || []).map(c => c.name), source: 'The Muse'
              });
            });
          } catch (_) {}
        }
      } catch (e) { console.error('The Muse:', e.message); }
    })()
  ];

  await Promise.all(fetches);

  // Deduplicate by normalized title+company
  const seen = new Set();
  const deduped = results.filter(j => {
    const key = (j.title + '|' + j.company).toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  jobCache = { data: deduped, ts: Date.now() };
  console.log('Fetched', deduped.length, 'unique jobs from', 5, 'APIs');
  return deduped;
}

function timeAgo(d) {
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return days + 'd ago';
  return Math.floor(days / 30) + 'mo ago';
}

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from',
  'is','was','are','were','be','been','being','have','has','had','do','does','did',
  'will','would','could','should','may','might','can','shall','must','need',
  'this','that','these','those','i','me','my','we','our','you','your','he','she',
  'it','they','them','his','her','its','their','what','which','who','whom','how',
  'when','where','why','all','each','every','both','few','more','most','other',
  'some','such','no','not','only','own','same','so','than','too','very','just',
  'also','about','above','after','again','any','as','because','before','between',
  'during','if','into','over','then','through','under','until','up','while','out',
  'off','down','here','there','new','well','per','via','etc','using','including',
  'across','along','among','able','many','much','make','made','like','get','got'
]);

const GENERIC_RESUME_WORDS = new Set([
  'experience','work','team','company','role','skills','professional','responsible',
  'ability','strong','excellent','developed','managed','created','built','led',
  'worked','helped','improved','increased','years','year','based','focused','driven',
  'related','relevant','key','proven','results','success','ensure','provide',
  'support','maintain','develop','implement','utilize','leverage','collaborate',
  'effectively','demonstrated','comprehensive','significant','various','multiple'
]);

function extractResumeKeywords(text) {
  const lower = text.toLowerCase();

  // 1. Extract job titles from resume (multiple patterns)
  const titleRe = /\b(?:senior|staff|lead|principal|chief|head|junior|associate|director|vp of|founder)?\s*(?:product|program|project|engineering|software|hardware|firmware|systems|silicon|chip|asic|fpga|electrical|mechanical|data|marketing|sales|operations|finance|design|ux|ui|research|business|customer|growth|content|community|full[- ]?stack|front[- ]?end|back[- ]?end|devops|cloud|security|general|account|event|member|experience|hospitality|coworking|real estate|quality|reliability|yield|test|validation|verification|characterization|integration|applications|field|customer quality)\s*(?:manager|engineer|designer|analyst|director|specialist|coordinator|developer|architect|scientist|lead|officer|strategist|consultant|planner|associate|leader|owner|operator|technologist)\b/gi;
  const titles = [...new Set([...text.matchAll(titleRe)].map(m => m[0].trim().toLowerCase()))];
  // "X & Y Manager" — extract the compound as a full title ("product & operations manager").
  // Previous version added bare "product" / "operations" which polluted titleKeywords
  // with LOW_SIGNAL words and gave no useful signal.
  const compoundTitleRe = /\b(product|operations|community|growth|strategy|marketing|revenue|hospitality|member|resident|experience)\s*[&+]\s*(product|operations|community|growth|strategy|marketing|revenue|hospitality|member|resident|experience)\s+(manager|director|lead|specialist|coordinator|leader)\b/gi;
  [...text.matchAll(compoundTitleRe)].forEach(m => {
    const t = m[0].trim().toLowerCase();
    if (!titles.includes(t)) titles.push(t);
  });
  // If no titles found, infer from section headers and key phrases
  if (titles.length === 0) {
    const inferRe = /\b(product[- ]?(?:leader|lead|ops|operations)|community[- ]?(?:manager|lead|builder|operations)|operations[- ]?(?:manager|lead|director)|general[- ]?manager|program[- ]?(?:manager|director)|growth[- ]?(?:manager|lead|marketing))\b/gi;
    [...text.matchAll(inferRe)].forEach(m => {
      const t = m[0].trim().toLowerCase();
      if (!titles.includes(t)) titles.push(t);
    });
  }
  // Last resort: use the domain + "manager"/"lead" combos from the domain skills
  if (titles.length === 0) {
    ['product', 'operations', 'community', 'marketing', 'growth'].forEach(d => {
      if (lower.includes(d)) titles.push(d + ' manager');
    });
  }

  // 2. Domain terms (broad coverage beyond just tech)
  const domainTerms = [
    'javascript','typescript','python','java','react','angular','vue','node','express',
    'sql','nosql','mongodb','postgresql','aws','azure','gcp','docker','kubernetes',
    'machine learning','deep learning','data science','ci/cd','devops','terraform',
    'product management','project management','agile','scrum',
    'marketing','sales','operations','strategy','analytics','growth','seo',
    'figma','sketch','ui/ux','user experience','graphic design',
    'accounting','finance','consulting','management','leadership',
    'coliving','co-living','coworking','co-working','hospitality','real estate',
    'proptech','community','occupancy','retention','acquisition','onboarding',
    'pricing','revenue','procurement','facilitation','events','membership',
    'marketplace','logistics','customer success','account management',
    'business development','financial reporting','budgeting','forecasting',
    'p&l','vendor management','cross-functional','go-to-market','gtm',
    'a/b testing','product launch','demand generation','pipeline',
    'stakeholder','community building','program design','event planning',
    'property management','tenant','resident','amenities','lease',
    'startup','founder','entrepreneurship','incubator','accelerator',
    'saas','b2b','b2c','crm','erp','api','automation',
    // Hardware / semiconductor / EE / data-center infrastructure
    'electrical engineering','electrical','electronics','semiconductor','semiconductors',
    'silicon','chip','chips','chipset','asic','fpga','soc','ic design','vlsi','rtl',
    'hardware','firmware','embedded','circuit','circuits','pcb','analog','digital design',
    'signal integrity','power integrity','rf','mixed signal','analog design',
    'verilog','systemverilog','vhdl','cadence','synopsys','mentor graphics',
    'foundry','fabrication','wafer','lithography','photolithography','yield','tape-out','tapeout',
    'process technology','7nm','5nm','14nm','10nm','3nm','node','cmos','finfet',
    'memory','dram','nand','nor','flash','hbm','ddr','lpddr','ssd','nvme','storage',
    'quality engineering','customer quality','failure analysis','fa','reliability',
    'validation','verification','characterization','test engineering','ate',
    'eight disciplines','8d','root cause','six sigma','lean','lean manufacturing',
    'continuous improvement','spc','dfmea','pfmea','iso9001','iatf',
    'cloud infrastructure','cloud computing','data center','datacenter','hyperscale',
    'on-prem','colocation','networking','compute','power systems',
    'odm','oem','supply chain engineering','manufacturing','operations engineering',
    'phd','doctorate','research engineer','applied research',
    // /Hardware
    'supply chain','inventory','warehouse','fulfillment','distribution',
    'healthcare','biotech','fintech','edtech','cleantech','insurtech',
    'nonprofit','social impact','sustainability','esg',
    'recruiting','talent acquisition','human resources','people operations',
    'legal','compliance','regulatory','governance','risk management',
    'content marketing','social media','brand','public relations',
    'copywriting','editorial','journalism','communications',
    'teaching','training','curriculum','education','instruction',
    'research','analysis','reporting','visualization','dashboards',
    'customer service','client relations','relationship management'
  ];
  const matchedDomain = [];
  domainTerms.forEach(t => {
    if (new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + '\\b', 'i').test(lower))
      matchedDomain.push(t);
  });

  // 3. Extract meaningful words from the actual resume text
  const words = lower.match(/[a-z][a-z\-\/]{2,}/g) || [];
  const wordFreq = {};
  words.forEach(w => {
    if (!STOP_WORDS.has(w) && !GENERIC_RESUME_WORDS.has(w) && w.length >= 4)
      wordFreq[w] = (wordFreq[w] || 0) + 1;
  });
  const specificWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([w]) => w);

  // 4. Extract bigrams (two-word phrases from the resume)
  const cleanWords = lower.replace(/[^a-z\s\-]/g, ' ').split(/\s+/).filter(w => w.length >= 3);
  const bigrams = {};
  for (let i = 0; i < cleanWords.length - 1; i++) {
    if (STOP_WORDS.has(cleanWords[i]) || STOP_WORDS.has(cleanWords[i + 1])) continue;
    if (GENERIC_RESUME_WORDS.has(cleanWords[i]) || GENERIC_RESUME_WORDS.has(cleanWords[i + 1])) continue;
    const bg = cleanWords[i] + ' ' + cleanWords[i + 1];
    if (bg.length >= 8) bigrams[bg] = (bigrams[bg] || 0) + 1;
  }
  const specificBigrams = Object.entries(bigrams)
    .filter(([, c]) => c >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([bg]) => bg);

  if (process.env.NODE_ENV !== 'test') {
    console.log('Resume keywords:', {
      titles: titles.slice(0, 5),
      domain: matchedDomain.slice(0, 10),
      words: specificWords.slice(0, 10),
      bigrams: specificBigrams.slice(0, 5)
    });
  }

  return { titles, domainSkills: matchedDomain, specificWords, specificBigrams };
}

function parseDaysAgo(posted) {
  if (!posted) return null;
  const p = posted.toLowerCase().trim();
  if (p === 'today') return 0;
  const dayMatch = p.match(/^(\d+)d\s*ago$/);
  if (dayMatch) return parseInt(dayMatch[1], 10);
  const moMatch = p.match(/^(\d+)mo\s*ago$/);
  if (moMatch) return parseInt(moMatch[1], 10) * 30;
  return null;
}

// [B6] Prefer a real Date on the job (set by every fetcher as `postedDate`)
// so ghost-freshness isn't limited by the lossy `Nd ago` / `Nmo ago` string
// bucket. Falls back to parseDaysAgo for legacy jobs.
function daysAgoFromJob(job) {
  if (job && job.postedDate instanceof Date && !Number.isNaN(job.postedDate.getTime())) {
    return Math.max(0, Math.floor((Date.now() - job.postedDate.getTime()) / 86400000));
  }
  return parseDaysAgo(job && job.posted);
}

// [B3] English-speaking-market ALLOWLIST (2026-04-18 rewrite).
// The previous blocklist dropped legitimate US-headquartered remote jobs whose
// location string mentioned "US / EMEA" or "Remote (Americas / EMEA)" and also
// leaked through Rome, Phnom Penh, Costa Rica, etc. because those were not in
// the list. The allowlist keeps a job iff its location clearly references a
// primary English-speaking market OR remote/worldwide/anywhere. Empty or
// missing locations pass (benefit of doubt — many ATS portals leave it blank).
const ALLOWED_MARKET_RE = /\b(united states|u\.s\.a?\.?|usa|us(?=[-/\s,(]|$)|north america|americas|canada|canadian|united kingdom|u\.k\.?|uk(?=[-/\s,(]|$)|england|scotland|wales|ireland|irish|republic of ireland|australia|australian|new zealand|anywhere|worldwide|global|remote|remote-first|remote friendly|work from home|wfh|distributed|austin|dallas|houston|san antonio|san francisco|sf\b|oakland|san jose|silicon valley|los angeles|l\.a\.|san diego|sacramento|seattle|portland|denver|boulder|new york|nyc|ny\b|brooklyn|manhattan|queens|bronx|boston|cambridge(?!,\s*uk)|philadelphia|philly|pittsburgh|washington|d\.c\.|dc\b|baltimore|atlanta|miami|orlando|tampa|jacksonville|charlotte|raleigh|durham|nashville|memphis|louisville|cincinnati|cleveland|columbus|indianapolis|detroit|chicago|milwaukee|minneapolis|st\.? paul|madison|st\.? louis|kansas city|omaha|oklahoma city|phoenix|tucson|albuquerque|salt lake|las vegas|reno|toronto|vancouver|montreal|montr[eé]al|calgary|edmonton|ottawa|london|manchester|leeds|edinburgh|dublin|belfast|cork|sydney|melbourne|brisbane|perth|adelaide|auckland|wellington)\b/i;

// Locations that override the allowlist: an otherwise matching location that
// also names an unambiguously non-English-market country is dropped. Keeps
// "Remote - USA / India" off the board while letting "Remote (US/EMEA)" in
// (EMEA alone is not an exclusive match).
const EXCLUSIVE_NON_ENGLISH_RE = /\b(india|bengaluru|bangalore|hyderabad|mumbai|pune|chennai|delhi|noida|gurgaon|china|shanghai|beijing|shenzhen|japan|tokyo|korea|seoul|france(?!\s+st)|paris|lyon|germany|berlin|munich|karlsruhe|hamburg|spain|madrid|barcelona|brazil|brasil|s[aã]o paulo|rio de janeiro|nigeria|lagos|philippines|manila|pakistan|karachi|cambodia|phnom penh|singapore|hong kong|taiwan|thailand|bangkok|vietnam|indonesia|jakarta|malaysia|kuala lumpur|mexico|mexico city|colombia|bogota|argentina|buenos aires|chile|santiago|peru|lima|egypt|cairo|turkey|istanbul|dubai|u\.a\.e\.|uae|saudi arabia|saudi|qatar|russia|moscow|poland|warsaw|czech|prague|romania|hungary|budapest|ukraine|kyiv|bangladesh|sri lanka|nepal|costa rica|panama|ecuador|bolivia|paraguay|uruguay|venezuela)\b/i;

function isAllowedMarketLocation(location) {
  if (!location) return true; // empty → keep
  const loc = String(location).toLowerCase();
  if (ALLOWED_MARKET_RE.test(loc) && !EXCLUSIVE_NON_ENGLISH_RE.test(loc)) return true;
  // Pure non-English city/country → drop
  if (EXCLUSIVE_NON_ENGLISH_RE.test(loc)) return false;
  // No allowlist match and no explicit blocklist match → keep if purely remote
  if (/\bremote\b/.test(loc) || /\banywhere\b/.test(loc)) return true;
  return false;
}

// Titles in non-English postings (German "m/w/d" etc.) are dropped regardless
// of the location string, since the job ad itself isn't written for an
// English-speaking audience.
function isAllowedMarketTitle(title) {
  if (!title) return true;
  return !/\b(all genders|m\/w\/d|m\/f\/d|w\/m\/d|h\/f|h\/m\/f)\b/i.test(String(title));
}

function parseSalaryMid(salary) {
  if (!salary) return null;
  const nums = salary.match(/\$?\s*(\d+)\s*k/gi);
  if (!nums || nums.length === 0) return null;
  const values = nums.map(n => parseInt(n.replace(/[^0-9]/g, ''), 10) * 1000);
  if (values.length >= 2) return (values[0] + values[1]) / 2;
  return values[0];
}

// Returns up to 5 human-readable terms from the resume that appear in the job
// posting — used by the UI to show "why this matches" on each user-search card.
function matchedTermsForJob(job, keywords) {
  const jobText = ((job.title || '') + ' ' + (job.description || '') + ' ' +
    (Array.isArray(job.tags) ? job.tags.join(' ') : '') + ' ' +
    (job.category || '')).toLowerCase();
  const LOW_SIGNAL = new Set(['marketing','sales','operations','strategy','analytics','growth',
    'finance','leadership','management','consulting','accounting','education',
    'reporting','training','research','analysis','stakeholder','pipeline',
    'acquisition','onboarding','retention','budget','startup','founder',
    'community','brand','communications']);
  const hits = new Set();
  // Prefer bigrams first (more specific), then domain skills, then titles
  (keywords.specificBigrams || []).forEach(bg => {
    if (hits.size >= 5) return;
    if (bg.length >= 8 && jobText.includes(bg)) hits.add(bg);
  });
  (keywords.domainSkills || []).forEach(s => {
    if (hits.size >= 5) return;
    // Skip 2-char abbreviations like 'fa' (Failure Analysis) that match random
    // substrings in job descriptions ("manufacturing", "california", etc.).
    if (s.length < 3) return;
    if (!LOW_SIGNAL.has(s) && jobText.includes(s)) hits.add(s);
  });
  (keywords.titles || []).forEach(t => {
    if (hits.size >= 5) return;
    if (jobText.includes(t)) hits.add(t);
  });
  return [...hits].slice(0, 5);
}

function scoreFit(job, keywords) {
  const jobTitle = (job.title || '').toLowerCase();
  const jobDesc = (job.description || '').toLowerCase();
  const jobText = (jobTitle + ' ' + jobDesc + ' ' +
    (Array.isArray(job.tags) ? job.tags.join(' ') : '') + ' ' +
    (job.category || '')).toLowerCase();

  // ═══ STEP 1: Does the job title match the resume's career field? ═══
  // Generic words that match too many unrelated jobs ("Customer Success Manager"
  // shouldn't score on "customer" from "Customer Quality Engineer").
  const LOW_SIGNAL = new Set(['marketing','sales','operations','strategy','analytics','growth',
    'finance','leadership','management','consulting','accounting','education',
    'reporting','training','research','analysis','stakeholder','pipeline',
    'acquisition','onboarding','retention','budget','startup','founder',
    'customer','senior','junior','principal','staff','team','lead','manager',
    'director','engineer','analyst','specialist','coordinator','associate',
    'partner','executive','assistant','intern','project','product','program',
    'global','international','regional','national','chief','head','vp',
    'business','corporate','service','support','success','experience','process']);

  // Gather title-relevant words from resume (single words, weaker signal)
  const titleKeywords = new Set();
  keywords.titles.forEach(t => t.split(/\s+/).filter(w => w.length >= 5 && !LOW_SIGNAL.has(w)).forEach(w => titleKeywords.add(w)));
  keywords.domainSkills.forEach(s => {
    if (!LOW_SIGNAL.has(s) && s.length >= 3) {
      s.split(/\s+/).filter(w => w.length >= 5 && !LOW_SIGNAL.has(w)).forEach(w => titleKeywords.add(w));
    }
  });
  keywords.specificWords.slice(0, 10).forEach(w => { if (w.length >= 5 && !LOW_SIGNAL.has(w)) titleKeywords.add(w); });

  // Multi-word phrases from resume titles — stronger signal. Used to require
  // real alignment on e.g. "customer quality" or "yield engineer" rather than
  // matching individual generic words.
  // (Intentionally uses em-dash literal, not escaped.)
  const titlePhrases = new Set();
  keywords.titles.forEach(t => {
    const words = t.split(/\s+/).filter(Boolean);
    for (let i = 0; i + 1 < words.length; i++) {
      const bg = words[i] + ' ' + words[i + 1];
      // Skip bigrams composed entirely of LOW_SIGNAL words
      if (LOW_SIGNAL.has(words[i]) && LOW_SIGNAL.has(words[i + 1])) continue;
      if (bg.length >= 8) titlePhrases.add(bg);
    }
  });

  const titleHits = [...titleKeywords].filter(w => jobTitle.includes(w));
  const phraseHits = [...titlePhrases].filter(p => jobTitle.includes(p));
  let titleRelevance = 0;
  if (phraseHits.length >= 1 || titleHits.length >= 2) titleRelevance = 2;
  else if (titleHits.length >= 1) titleRelevance = 1;

  // ═══ STEP 2: Wrong career field detection ═══
  let wrongField = false;
  // True SWE signal — must include code/framework terms, not just cloud provider
  // names. An EE resume mentioning "AWS" as a customer shouldn't read as SWE.
  const resumeIsSoftware = keywords.domainSkills.some(s =>
    ['javascript','python','java','react','angular','vue','node','express',
     'kubernetes','docker','machine learning','data science','ci/cd','devops',
     'sql','terraform','golang','rust','typescript','c++','ruby','php'].includes(s));
  const resumeIsCloudUser = keywords.domainSkills.some(s =>
    ['aws','azure','gcp'].includes(s));
  const resumeIsTech = resumeIsSoftware || resumeIsCloudUser;
  const resumeIsFinance = keywords.domainSkills.some(s =>
    ['accounting','finance','financial reporting','budgeting','forecasting'].includes(s));
  const resumeIsDesign = keywords.domainSkills.some(s =>
    ['figma','sketch','ui/ux','user experience','graphic design'].includes(s));
  const resumeIsSales = keywords.domainSkills.some(s =>
    ['sales','account management','business development'].includes(s));
  const resumeIsContent = keywords.domainSkills.some(s =>
    ['seo','content marketing','copywriting','editorial'].includes(s));
  // True ops signal needs an actual ops title. Passing mentions of
  // "supply chain", "distribution", etc. in an EE/semi resume shouldn't make
  // them an ops/supply-chain professional.
  const resumeIsOps = keywords.titles.some(t =>
      /\b(supply chain|logistics|warehouse|fulfillment|distribution|procurement|operations)\s+(manager|director|lead|analyst|specialist|coordinator|planner|associate)\b/i.test(t))
    || keywords.titles.some(t => /\b(supply chain|logistics|warehouse|fulfillment|procurement)\b/i.test(t));
  // Hardware / semiconductor / EE signal — if any of these hit, hardware jobs are
  // in-field and cloud-infrastructure jobs get treated as on-domain.
  const resumeIsHardware = keywords.domainSkills.some(s =>
    ['electrical engineering','electrical','electronics','semiconductor','semiconductors',
     'silicon','chip','chips','chipset','asic','fpga','soc','vlsi','rtl','hardware',
     'firmware','embedded','analog','mixed signal','foundry','wafer','yield',
     'tape-out','tapeout','cmos','finfet','memory','dram','nand','hbm','ddr','ssd',
     'customer quality','failure analysis','reliability','characterization',
     'data center','datacenter','hyperscale','cloud infrastructure','7nm','5nm',
     '14nm','10nm','3nm'].includes(s))
    || keywords.titles.some(t =>
        /(customer quality|yield|product|hardware|firmware|electrical|semiconductor|applications|systems|reliability|test|validation|silicon)\s+engineer/i.test(t));
  const resumeIsHR = keywords.domainSkills.some(s =>
    ['recruiting','talent acquisition','human resources','people operations'].includes(s));
  // "Communications" alone is too permissive (matches journal names like
  // "Nature Communications"). Require an actual comms role / context.
  const resumeIsComms = keywords.domainSkills.some(s =>
    ['public relations','copywriting','editorial','journalism'].includes(s))
    || keywords.titles.some(t => /\b(internal|corporate|employee|external|brand)\s+communications\b/i.test(t))
    || keywords.titles.some(t => /\bcommunications\s+(manager|director|lead|specialist|strategist|officer)\b/i.test(t));
  // Same pattern for marketing — a "Persuasive Marketing" adjunct course
  // shouldn't make someone a marketer. Only trust an actual marketing title
  // in the extracted titles list.
  // Marketing detection — require an actual marketing title (not "growth manager"
  // alone, which can be fabricated from a domain mention of "growth"). The
  // last-resort fallback in extractResumeKeywords adds "growth manager" /
  // "product manager" etc. for any domain word in the resume, so trusting
  // that as a marketing signal flips Kyle (community/ops) to marketer.
  const resumeIsMarketing = keywords.domainSkills.some(s =>
    ['content marketing','seo','demand generation','go-to-market','gtm'].includes(s))
    || keywords.titles.some(t => /\bmarketing\b/i.test(t))
    || keywords.titles.some(t => /\b(demand generation|lifecycle marketing|performance marketing|product marketing|brand manager|brand director)\b/i.test(t));

  // Engineering/tech roles for non-tech, non-hardware resumes
  if (!resumeIsTech && !resumeIsHardware && /\b(software|data|ml|ai|backend|frontend|full.?stack|devops|cloud|platform|infrastructure|security|systems|site reliability|sre|analytics)\s*(engineer|developer|scientist|architect)\b/i.test(jobTitle)) wrongField = true;
  if (!resumeIsTech && !resumeIsHardware && /\b(engineering manager|tech lead|cto|vp engineering|head of engineering)\b/i.test(jobTitle)) wrongField = true;
  // Hardware resume without true SWE signal: pure software roles are off-field
  // (AWS/Azure mentions alone don't qualify a customer-quality EE as a coder).
  if (resumeIsHardware && !resumeIsSoftware) {
    if (/\b(software|front.?end|back.?end|full.?stack|ios|android|mobile|web|application|backend|frontend|ml|ai|data|site reliability|sre|infrastructure|platform|devops)\s*(engineer|developer|scientist|architect|engineering)\b/i.test(jobTitle)) wrongField = true;
    if (/\b(staff|principal|senior|lead|distinguished)\s+(software|backend|frontend|platform|systems|app|application|web)\s+(engineer|developer|engineering)\b/i.test(jobTitle)) wrongField = true;
    if (/\bpartner\s+(engineer|solutions)\b/i.test(jobTitle)) wrongField = true;
    if (/\b(engineering manager|tech lead|cto|vp engineering|head of engineering|director of engineering)\b/i.test(jobTitle)) wrongField = true;
    if (/\bdeveloper\s+(advocate|relations|experience)\b/i.test(jobTitle)) wrongField = true;
    if (/\b(search quality rater|data labeler|annotation specialist)\b/i.test(jobTitle)) wrongField = true;
  }
  // Finance roles for non-finance resumes
  if (!resumeIsFinance && /\b(fp&a|financial analyst|controller|accountant|bookkeeper|tax|audit|treasury|accounts payable|accounts receivable|payroll|stock administrator)\b/i.test(jobTitle)) wrongField = true;
  // Design roles for non-design resumes
  if (!resumeIsDesign && /\b(product designer|ux designer|ui designer|graphic designer|creative director|visual designer|brand designer|design lead)\b/i.test(jobTitle)) wrongField = true;
  // Sales roles for non-sales resumes
  if (!resumeIsSales && /\b(account executive|sales development|sales representative|bdr|sdr|business development representative|territory account|inside sales|outside sales|international sales|regional sales|enterprise sales|sales manager|sales director|head of sales|vp sales|chief revenue officer|revenue operations)\b/i.test(jobTitle)) wrongField = true;
  // Content/SEO for non-content resumes
  if (!resumeIsContent && /\b(seo manager|seo specialist|content marketing manager|content strategist|copywriter|editorial director)\b/i.test(jobTitle)) wrongField = true;
  // HR / employee communications / recruiting for non-HR, non-comms resumes (Avinash miss)
  if (!resumeIsHR && !resumeIsComms && /\b(employee communications|internal communications|people partner|hr business partner|hrbp|talent acquisition|recruiter|recruiting manager|head of people|chief people officer|people operations manager)\b/i.test(jobTitle)) wrongField = true;
  // Generic "Communications Manager/Director" — off-field for non-comms resumes
  if (!resumeIsComms && /\b(communications|pr|public relations)\s+(manager|director|lead|specialist)\b/i.test(jobTitle)) wrongField = true;
  // Marketing roles for non-marketing resumes (product marketing manager, growth marketing, etc.)
  if (!resumeIsMarketing && /\b(product marketing manager|pmm|growth marketing manager|marketing manager|marketing director|brand manager|brand director|head of marketing|demand generation|lifecycle marketing|performance marketing|content marketing manager|marketing lead|marketing strategist)\b/i.test(jobTitle)) wrongField = true;
  if (!resumeIsMarketing && /\b(vp|svp|evp|vice president|chief|head|director)[\s,]+(of\s+)?marketing\b/i.test(jobTitle)) wrongField = true;
  // Legal roles for non-legal resumes
  if (/\b(counsel|attorney|paralegal|legal director|general counsel|litigation|compliance counsel)\b/i.test(jobTitle)) wrongField = true;
  // Always wrong field regardless of resume — but NOT electrical/mechanical if the resume has
  // a hardware/EE signal, since those are the exact roles Avinash/hardware resumes want.
  if (/\b(nurse|pharmacist|physician|dental|veterinary|actuary|underwriter|truck driver|forklift|custodian|janitor|security guard|receptionist|footwear|apparel)\b/i.test(jobTitle)) wrongField = true;
  if (!resumeIsHardware && /\b(solar|electrical|mechanical|civil|chemical)\s*(engineer|technician|specialist|outreach)?\b/i.test(jobTitle)) wrongField = true;
  // Ops/supply-chain roles wrong only for non-ops resumes. Hardware resume IS NOT
  // exempt — "Warehouse Management Systems Consultant" at a SaaS company is not a
  // semiconductor ops role, even if the resume mentions ODM supply chain.
  if (!resumeIsOps && /\b(warehouse|supply chain|procurement|logistics|fulfillment)\s*(engineer|technician|specialist|outreach|strategy|analyst|consultant|manager)?\b/i.test(jobTitle)) wrongField = true;
  if (!resumeIsOps && /\b(dashmart|grocery|last[- ]mile|delivery operations)\b/i.test(jobTitle)) wrongField = true;
  if (!resumeIsHardware && /\b(it security|it director|network engineer|database administrator|helpdesk|desktop support)\b/i.test(jobTitle)) wrongField = true;

  // ═══ STEP 3: Content match score ═══
  let contentScore = 0;
  // High-signal domain skills in job text
  let highHits = 0;
  keywords.domainSkills.forEach(s => {
    if (!LOW_SIGNAL.has(s) && jobText.includes(s)) highHits++;
  });
  contentScore += Math.min(30, highHits * 6);
  // Bigram matches — very specific
  let bgHits = 0;
  keywords.specificBigrams.forEach(bg => { if (jobText.includes(bg)) bgHits++; });
  contentScore += Math.min(24, bgHits * 8);
  // Low-signal skills — tiny bump
  let lowHits = 0;
  keywords.domainSkills.forEach(s => { if (LOW_SIGNAL.has(s) && jobText.includes(s)) lowHits++; });
  contentScore += Math.min(5, lowHits);

  // ═══ STEP 4: Final assembly ═══
  let score;
  if (wrongField) {
    score = Math.min(25, 5 + contentScore * 0.15);
  } else if (titleRelevance === 2) {
    score = 65 + Math.min(33, contentScore * 0.55);
  } else if (titleRelevance === 1) {
    score = 30 + Math.min(48, contentScore * 0.8);
  } else {
    score = 10 + Math.min(30, contentScore * 0.5);
  }

  // Freshness bonuses/penalties
  const days = parseDaysAgo(job.posted);
  if (days !== null && days <= 7) score += 3;
  else if (days !== null && days > 45) score -= 6;
  else if (days !== null && days > 30) score -= 4;
  else if (days !== null && days > 14) score -= 2;
  const loc = (job.location || '').toLowerCase();
  if (/austin/i.test(loc)) score += 2;
  else if (/remote/i.test(loc) || job.remote) score += 1;

  return Math.max(5, Math.min(98, Math.round(score)));
}

// ── Company Info for Interview Prep ──────────────────────────────
const COMPANY_INFO = {
  'airbnb': { size: '6,000+', funding: 'Public (ABNB)', glassdoor: '4.1', industry: 'Travel & Hospitality', news: 'Expanding long-term stay offerings and experiences platform' },
  'industrious': { size: '1,500+', funding: 'Series E ($250M)', glassdoor: '3.8', industry: 'Coworking & Real Estate', news: 'Largest premium flexible workspace provider in the US' },
  'kindred': { size: '50-100', funding: 'Series A', glassdoor: '4.3', industry: 'Coliving & Community', news: 'Building coliving communities for remote workers' },
  'hipcamp': { size: '100-200', funding: 'Series C ($57M)', glassdoor: '3.9', industry: 'Outdoor & Hospitality', news: 'Leading outdoor stays marketplace, expanding internationally' },
  'stripe': { size: '8,000+', funding: 'Private ($95B valuation)', glassdoor: '4.2', industry: 'Fintech & Payments', news: 'Processing trillions in payment volume annually' },
  'notion': { size: '800+', funding: 'Series C ($10B valuation)', glassdoor: '4.0', industry: 'Productivity & SaaS', news: 'AI-powered workspace features driving enterprise adoption' },
  'figma': { size: '1,500+', funding: 'Acquired by Adobe (cancelled), independent', glassdoor: '4.4', industry: 'Design & SaaS', news: 'Leading collaborative design tool, expanding into development' },
  'ramp': { size: '1,000+', funding: 'Series D ($8.1B valuation)', glassdoor: '4.5', industry: 'Fintech & B2B', news: 'Fastest-growing corporate card and spend management platform' },
  'sonder': { size: '2,000+', funding: 'Public (SOND)', glassdoor: '3.2', industry: 'Hospitality & Real Estate', news: 'Restructuring operations after layoffs, focusing on profitability' },
  'clipboard health': { size: '1,500+', funding: 'Series C ($1.3B valuation)', glassdoor: '3.5', industry: 'Healthcare & Marketplace', news: 'On-demand healthcare staffing marketplace growing rapidly' },
  'capital factory': { size: '50-100', funding: 'Private', glassdoor: '4.0', industry: 'Startup Accelerator & Coworking', news: 'Austin-based accelerator and innovation hub' },
  'teero': { size: '10-50', funding: 'Seed', glassdoor: 'N/A', industry: 'Proptech & Real Estate', news: 'Streamlining real estate transactions' },
  'homeward': { size: '100-200', funding: 'Series B ($136M)', glassdoor: '4.1', industry: 'Proptech & Real Estate', news: 'Austin-based power buyer platform for home purchases' },
  'duolingo': { size: '800+', funding: 'Public (DUOL)', glassdoor: '4.3', industry: 'Edtech & Consumer', news: 'AI-powered language learning, strong subscriber growth' },
  'nextdoor': { size: '1,000+', funding: 'Public (KIND)', glassdoor: '3.4', industry: 'Social & Local', news: 'Neighborhood social network monetizing through local advertising' },
  'eventbrite': { size: '1,000+', funding: 'Public (EB)', glassdoor: '3.5', industry: 'Events & Marketplace', news: 'Pivoting to creator-focused events platform' },
  'flexport': { size: '3,000+', funding: 'Series E ($8B valuation)', glassdoor: '3.3', industry: 'Logistics & Supply Chain', news: 'Global freight forwarder rebuilding after leadership changes' },
  'rippling': { size: '3,000+', funding: 'Series F ($13.5B valuation)', glassdoor: '3.8', industry: 'HR Tech & B2B SaaS', news: 'Unified workforce platform expanding globally' },
  'thumbtack': { size: '1,000+', funding: 'Series G ($3.2B valuation)', glassdoor: '3.6', industry: 'Marketplace & Local Services', news: 'Local services marketplace adding AI matching' },
  'the commune': { size: '10-50', funding: 'Bootstrapped', glassdoor: 'N/A', industry: 'Coliving & Community', news: 'Austin-based intentional community spaces' },
  'drillbit': { size: '10-50', funding: 'Seed', glassdoor: 'N/A', industry: 'Energy & Technology', news: 'Oil and gas technology startup' },
  'closinglock': { size: '50-100', funding: 'Series A', glassdoor: '4.2', industry: 'Fintech & Real Estate', news: 'Austin-based wire fraud prevention for real estate' },
  'vuka collective': { size: '10-50', funding: 'Private', glassdoor: 'N/A', industry: 'Coworking & Community', news: 'Austin-based coworking and event spaces' },
};

app.get('/api/company-info', (req, res) => {
  const company = (req.query.company || '').trim().toLowerCase();
  // [A8] `mapped` tells the client whether this is real data or a placeholder.
  // Unmapped companies used to render a misleading "Industry: Technology ·
  // Size: Unknown" panel that looked like signal. The client now hides the
  // panel entirely when `mapped: false`.
  if (!company) return res.json({ mapped: false, size: 'Unknown', industry: 'Technology' });

  // Exact match
  if (COMPANY_INFO[company]) return res.json({ mapped: true, ...COMPANY_INFO[company] });

  // Partial match fallback
  const partial = Object.keys(COMPANY_INFO).find(k =>
    k.includes(company) || company.includes(k)
  );
  if (partial) return res.json({ mapped: true, ...COMPANY_INFO[partial] });

  res.json({ mapped: false, size: 'Unknown', funding: 'Unknown', glassdoor: 'N/A', industry: 'Technology', news: '' });
});

// Export pure helpers for the test suite. `require.main === module` guards
// the listen() call so tests can `require('./server')` without opening a port.
module.exports = {
  app,
  scoreFit,
  matchedTermsForJob,
  extractResumeKeywords,
  parseDaysAgo,
  daysAgoFromJob,
  isAllowedMarketLocation,
  isAllowedMarketTitle,
  looksLikePdf,
  selectCompaniesForResume,
  timeAgo,
  rankHunterContacts,
  ATS_COMPANIES,
  COMPANY_INFO,
};

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Your Job Board running on port ${PORT}`));
}
