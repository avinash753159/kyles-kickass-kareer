const express = require('express');
const rateLimit = require('express-rate-limit');
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const HUNTER_API_KEY = process.env.HUNTER_API_KEY || '';

const hunterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many lookup requests. Try again in a minute.' }
});

app.get('/healthz', (req, res) => res.status(200).json({ ok: true, uptime: process.uptime() }));

// Server-side PDF text extraction
app.post('/api/extract-text', async (req, res) => {
  try {
    const { fileData, fileName } = req.body;
    if (!fileData) return res.status(400).json({ error: 'No file data' });

    const b64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const buf = Buffer.from(b64, 'base64');

    if (/\.pdf$/i.test(fileName)) {
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
];

// ── Ghost Job Detection Data ─────────────────────────────────────
const RECENT_LAYOFFS = [
  { company: 'meta', date: '2025-11' },
  { company: 'amazon', date: '2025-09' },
  { company: 'google', date: '2025-10' },
  { company: 'microsoft', date: '2025-08' },
  { company: 'salesforce', date: '2025-10' },
  { company: 'snap', date: '2025-07' },
  { company: 'spotify', date: '2025-06' },
  { company: 'discord', date: '2025-09' },
  { company: 'twitch', date: '2025-08' },
  { company: 'bumble', date: '2025-11' },
  { company: 'zillow', date: '2025-07' },
  { company: 'redfin', date: '2025-08' },
  { company: 'opendoor', date: '2025-09' },
  { company: 'compass', date: '2025-10' },
  { company: 'sonder', date: '2025-11' },
  { company: 'vacasa', date: '2025-06' },
  { company: 'wayfair', date: '2025-07' },
  { company: 'robinhood', date: '2025-08' },
  { company: 'coinbase', date: '2025-09' },
  { company: 'block', date: '2025-10' },
];

function getLayoffMatch(company) {
  if (!company) return false;
  const norm = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return RECENT_LAYOFFS.some(l => {
    const lNorm = l.company.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!norm.includes(lNorm) && !lNorm.includes(norm)) return false;
    const layoffDate = new Date(l.date + '-01');
    return layoffDate >= sixMonthsAgo;
  });
}

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

  function isTitleRelevant(title) {
    if (!title) return false;
    const t = title.toLowerCase();
    // Broad match: any resume keyword word (4+ chars) in the title
    if (titleTerms.some(term => t.includes(term) || term.split(/\s+/).some(w => w.length >= 4 && t.includes(w)))) return true;
    // Also match common business roles that most resumes relate to
    const broadRoles = ['manager', 'director', 'lead', 'coordinator', 'specialist', 'analyst', 'associate', 'operations', 'strategy', 'growth', 'marketing', 'product', 'community', 'customer', 'success', 'program', 'project', 'sales', 'account', 'business', 'experience'];
    return broadRoles.some(r => t.includes(r));
  }

  // Process in batches of 10 concurrent
  for (let i = 0; i < companies.length; i += 10) {
    const batch = companies.slice(i, i + 10);
    const fetches = batch.map(async (co) => {
      try {
        let url, parseJobs;
        if (co.platform === 'greenhouse') {
          url = `https://boards-api.greenhouse.io/v1/boards/${co.slug}/jobs`;
          parseJobs = (data) => {
            return (data.jobs || []).filter(j => isTitleRelevant(j.title)).map(j => ({
              id: `gh-${co.slug}-${j.id}`,
              title: j.title || '',
              company: co.name,
              location: (j.location && j.location.name) || 'Unknown',
              remote: /remote/i.test((j.location && j.location.name) || ''),
              url: j.absolute_url || '',
              logo: '',
              salary: '',
              posted: j.updated_at ? timeAgo(new Date(j.updated_at)) : '',
              type: 'Full-time',
              description: '',
              tags: co.tags || [],
              source: 'Greenhouse'
            }));
          };
        } else if (co.platform === 'ashby') {
          url = `https://api.ashbyhq.com/posting-api/job-board/${co.slug}`;
          parseJobs = (data) => {
            return (data.jobs || []).filter(j => isTitleRelevant(j.title)).map(j => ({
              id: `ab-${co.slug}-${j.id || Math.random().toString(36).slice(2)}`,
              title: j.title || '',
              company: co.name,
              location: j.location || 'Unknown',
              remote: /remote/i.test(j.location || ''),
              url: j.jobUrl || '',
              logo: '',
              salary: '',
              posted: j.publishedAt ? timeAgo(new Date(j.publishedAt)) : '',
              type: 'Full-time',
              description: (j.descriptionPlain || '').substring(0, 1500),
              tags: co.tags || [],
              source: 'Ashby'
            }));
          };
        } else if (co.platform === 'lever') {
          url = `https://api.lever.co/v0/postings/${co.slug}`;
          parseJobs = (data) => {
            if (!Array.isArray(data)) return [];
            return data.filter(j => isTitleRelevant(j.text)).map(j => ({
              id: `lv-${co.slug}-${j.id || Math.random().toString(36).slice(2)}`,
              title: j.text || '',
              company: co.name,
              location: (j.categories && j.categories.location) || 'Unknown',
              remote: /remote/i.test((j.categories && j.categories.location) || ''),
              url: j.hostedUrl || '',
              logo: '',
              salary: '',
              posted: j.createdAt ? timeAgo(new Date(j.createdAt)) : '',
              type: 'Full-time',
              description: (j.descriptionPlain || '').substring(0, 1500),
              tags: co.tags || [],
              source: 'Lever'
            }));
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
      .map(job => ({ ...job, fit: scoreFit(job, keywords) }))
      .sort((a, b) => b.fit - a.fit);

    // Filter out clearly non-English-market jobs from all results
    const nonEnglishMarket = /\b(india|bengaluru|bangalore|hyderabad|mumbai|pune|chennai|delhi|noida|gurgaon|china|shanghai|beijing|shenzhen|japan|tokyo|korea|seoul|france|paris|lyon|germany|berlin|munich|karlsruhe|hamburg|spain|madrid|barcelona|brazil|s[aã]o paulo|nigeria|lagos|philippines|manila|pakistan|karachi|latam|latin america|asia|africa|middle east|emea|apac|europe|singapore|hong kong|taiwan|thailand|bangkok|vietnam|indonesia|jakarta|malaysia|kuala lumpur|mexico|colombia|bogota|argentina|buenos aires|chile|santiago|peru|lima|egypt|cairo|turkey|istanbul|dubai|uae|saudi|qatar|russia|moscow|poland|warsaw|czech|prague|romania|hungary|budapest|ukraine|kyiv|bangladesh|sri lanka|nepal)\b/i;
    scored = scored.filter(j => {
      const loc = (j.location || '').toLowerCase();
      const title = (j.title || '').toLowerCase();
      // Filter location
      if (nonEnglishMarket.test(loc)) return false;
      // Filter titles with non-English markers
      if (/\b(all genders|m\/w\/d|m\/f\/d)\b/i.test(title)) return false;
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

      // Ghost detection fields
      j.daysAgo = parseDaysAgo(j.posted);
      if (j.daysAgo === null) j.freshness = 'unknown';
      else if (j.daysAgo <= 7) j.freshness = 'fresh';
      else if (j.daysAgo <= 14) j.freshness = 'normal';
      else if (j.daysAgo <= 30) j.freshness = 'aging';
      else j.freshness = 'stale';

      j.layoffSignal = getLayoffMatch(j.company);
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

    // Ghost risk assessment
    top.forEach(j => {
      let signals = 0;
      if (j.freshness === 'stale' || j.freshness === 'aging') signals++;
      if (j.layoffSignal) signals++;
      if (j.reposted) signals++;
      j.ghostRisk = signals === 0 ? 'low' : signals === 1 ? 'medium' : 'high';
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
          results.push({
            id: 'rok-' + (j.id || j.slug), title: j.position, company: j.company || 'Unknown',
            location: j.location || 'Remote', remote: true,
            url: j.url || ('https://remoteok.com/remote-jobs/' + j.slug),
            logo: j.company_logo || j.logo || '',
            salary: j.salary_min && j.salary_max ? '$' + Math.round(j.salary_min / 1000) + 'k\u2013$' + Math.round(j.salary_max / 1000) + 'k' : '',
            posted: j.date ? timeAgo(new Date(j.date)) : '', type: 'Full-time',
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
          results.push({
            id: 'abn-' + j.slug, title: j.title, company: j.company_name || 'Unknown',
            location: j.location || (j.remote ? 'Remote' : ''), remote: !!j.remote,
            url: j.url, logo: '', salary: '',
            posted: j.created_at ? timeAgo(new Date(j.created_at * 1000)) : '', type: (j.job_types || []).join(', ') || 'Full-time',
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
          results.push({
            id: 'jcy-' + j.id, title: j.jobTitle, company: j.companyName || 'Unknown',
            location: j.jobGeo || 'Remote', remote: true,
            url: j.url, logo: j.companyLogo || '', salary: j.annualSalaryMin && j.annualSalaryMax ? '$' + Math.round(j.annualSalaryMin / 1000) + 'k\u2013$' + Math.round(j.annualSalaryMax / 1000) + 'k' : '',
            posted: j.pubDate ? timeAgo(new Date(j.pubDate)) : '', type: j.jobType || 'Full-time',
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
          results.push({
            id: 'rmt-' + j.id, title: j.title, company: j.company_name || 'Unknown',
            location: j.candidate_required_location || 'Remote', remote: true,
            url: j.url, logo: j.company_logo_url || j.company_logo || '',
            salary: j.salary || '', posted: j.publication_date ? timeAgo(new Date(j.publication_date)) : '',
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
              results.push({
                id: 'muse-' + j.id, title: j.name, company: (j.company || {}).name || 'Unknown',
                location: loc, remote: loc.toLowerCase().includes('remote'),
                url: j.refs && j.refs.landing_page ? j.refs.landing_page : '',
                logo: '', salary: '',
                posted: j.publication_date ? timeAgo(new Date(j.publication_date)) : '',
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
  const titleRe = /\b(?:senior|staff|lead|principal|chief|head|junior|associate|director|vp of|founder)?\s*(?:product|program|project|engineering|software|data|marketing|sales|operations|finance|design|ux|ui|research|business|customer|growth|content|community|full[- ]?stack|front[- ]?end|back[- ]?end|devops|cloud|security|general|account|event|member|experience|hospitality|coworking|real estate)\s*(?:manager|engineer|designer|analyst|director|specialist|coordinator|developer|architect|scientist|lead|officer|strategist|consultant|planner|associate|leader|owner|operator)\b/gi;
  const titles = [...new Set([...text.matchAll(titleRe)].map(m => m[0].trim().toLowerCase()))];
  // Also extract "X & Y" compound titles like "Product & Operations"
  const compoundRe = /\b(?:product|operations|community|growth|strategy|marketing|revenue|hospitality)\s*[&+]\s*(?:product|operations|community|growth|strategy|marketing|revenue|hospitality)\b/gi;
  [...text.matchAll(compoundRe)].forEach(m => {
    const parts = m[0].toLowerCase().split(/\s*[&+]\s*/);
    parts.forEach(p => { if (p.length >= 4 && !titles.includes(p)) titles.push(p); });
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

  console.log('Resume keywords:', {
    titles: titles.slice(0, 5),
    domain: matchedDomain.slice(0, 10),
    words: specificWords.slice(0, 10),
    bigrams: specificBigrams.slice(0, 5)
  });

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

function parseSalaryMid(salary) {
  if (!salary) return null;
  const nums = salary.match(/\$?\s*(\d+)\s*k/gi);
  if (!nums || nums.length === 0) return null;
  const values = nums.map(n => parseInt(n.replace(/[^0-9]/g, ''), 10) * 1000);
  if (values.length >= 2) return (values[0] + values[1]) / 2;
  return values[0];
}

function scoreFit(job, keywords) {
  const jobTitle = (job.title || '').toLowerCase();
  const jobDesc = (job.description || '').toLowerCase();
  const jobText = (jobTitle + ' ' + jobDesc + ' ' +
    (Array.isArray(job.tags) ? job.tags.join(' ') : '') + ' ' +
    (job.category || '')).toLowerCase();

  // ═══ STEP 1: Does the job title match the resume's career field? ═══
  const LOW_SIGNAL = new Set(['marketing','sales','operations','strategy','analytics','growth',
    'finance','leadership','management','consulting','accounting','education',
    'reporting','training','research','analysis','stakeholder','pipeline',
    'acquisition','onboarding','retention','budget','startup','founder']);

  // Gather title-relevant words from resume
  const titleKeywords = new Set();
  keywords.titles.forEach(t => t.split(/\s+/).filter(w => w.length >= 4).forEach(w => titleKeywords.add(w)));
  keywords.domainSkills.forEach(s => {
    if (!LOW_SIGNAL.has(s)) s.split(/\s+/).filter(w => w.length >= 4).forEach(w => titleKeywords.add(w));
  });
  // Also add resume-specific words that appear 2+ times
  keywords.specificWords.slice(0, 10).forEach(w => { if (w.length >= 5) titleKeywords.add(w); });

  const titleHits = [...titleKeywords].filter(w => jobTitle.includes(w));
  let titleRelevance = 0;
  if (titleHits.length >= 2) titleRelevance = 2;
  else if (titleHits.length === 1) titleRelevance = 1;

  // ═══ STEP 2: Wrong career field detection ═══
  let wrongField = false;
  const resumeIsTech = keywords.domainSkills.some(s =>
    ['javascript','python','java','react','node','aws','kubernetes','docker',
     'machine learning','data science','ci/cd','devops','sql','terraform',
     'golang','rust','typescript','c++','ruby','php'].includes(s));
  const resumeIsFinance = keywords.domainSkills.some(s =>
    ['accounting','finance','financial reporting','budgeting','forecasting'].includes(s));
  const resumeIsDesign = keywords.domainSkills.some(s =>
    ['figma','sketch','ui/ux','user experience','graphic design'].includes(s));
  const resumeIsSales = keywords.domainSkills.some(s =>
    ['sales','account management','business development'].includes(s));
  const resumeIsContent = keywords.domainSkills.some(s =>
    ['seo','content marketing','copywriting','editorial'].includes(s));
  const resumeIsOps = keywords.domainSkills.some(s =>
    ['supply chain','inventory','warehouse','fulfillment','distribution','logistics','procurement'].includes(s));

  // Engineering/tech roles for non-tech resumes
  if (!resumeIsTech && /\b(software|data|ml|ai|backend|frontend|full.?stack|devops|cloud|platform|infrastructure|security|systems|site reliability|sre|analytics)\s*(engineer|developer|scientist|architect)\b/i.test(jobTitle)) wrongField = true;
  if (!resumeIsTech && /\b(engineering manager|tech lead|cto|vp engineering|head of engineering)\b/i.test(jobTitle)) wrongField = true;
  // Finance roles for non-finance resumes
  if (!resumeIsFinance && /\b(fp&a|financial analyst|controller|accountant|bookkeeper|tax|audit|treasury|accounts payable|accounts receivable|payroll|stock administrator)\b/i.test(jobTitle)) wrongField = true;
  // Design roles for non-design resumes
  if (!resumeIsDesign && /\b(product designer|ux designer|ui designer|graphic designer|creative director|visual designer|brand designer|design lead)\b/i.test(jobTitle)) wrongField = true;
  // Sales roles for non-sales resumes
  if (!resumeIsSales && /\b(account executive|sales development|sales representative|bdr|sdr|business development representative|territory account|inside sales|outside sales)\b/i.test(jobTitle)) wrongField = true;
  // Content/SEO for non-content resumes
  if (!resumeIsContent && /\b(seo manager|seo specialist|content marketing manager|content strategist|copywriter|editorial director)\b/i.test(jobTitle)) wrongField = true;
  // Legal roles for non-legal resumes
  if (/\b(counsel|attorney|paralegal|legal director|general counsel|litigation|compliance counsel)\b/i.test(jobTitle)) wrongField = true;
  // Always wrong field regardless of resume
  if (/\b(nurse|pharmacist|physician|dental|veterinary|actuary|underwriter|truck driver|forklift|custodian|janitor|security guard|receptionist|data center|footwear|apparel|solar|electrical|mechanical|civil|chemical)\s*(engineer|technician|specialist|outreach)?\b/i.test(jobTitle)) wrongField = true;
  // Ops/supply-chain roles wrong only for non-ops resumes
  if (!resumeIsOps && /\b(warehouse|supply chain|procurement)\s*(engineer|technician|specialist|outreach)?\b/i.test(jobTitle)) wrongField = true;
  if (/\b(it security|it director|network engineer|database administrator|helpdesk|desktop support)\b/i.test(jobTitle)) wrongField = true;

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
  if (!company) return res.json({ size: 'Unknown', industry: 'Technology' });

  // Exact match
  if (COMPANY_INFO[company]) return res.json(COMPANY_INFO[company]);

  // Partial match fallback
  const partial = Object.keys(COMPANY_INFO).find(k =>
    k.includes(company) || company.includes(k)
  );
  if (partial) return res.json(COMPANY_INFO[partial]);

  res.json({ size: 'Unknown', funding: 'Unknown', glassdoor: 'N/A', industry: 'Technology', news: '' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Your Job Board running on port ${PORT}`));
