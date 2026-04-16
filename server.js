const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const HUNTER_API_KEY = process.env.HUNTER_API_KEY || '';

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

      // Fallback: use Puppeteer to render and extract
      try {
        const puppeteer = require('puppeteer');
        const tmpPath = path.join(__dirname, 'output', '_tmp_extract.pdf');
        fs.writeFileSync(tmpPath, buf);
        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.goto('file://' + tmpPath.replace(/\\/g, '/'), { waitUntil: 'networkidle2', timeout: 15000 });
        const text = await page.evaluate(() => document.body.innerText);
        await browser.close();
        try { fs.unlinkSync(tmpPath); } catch (_) {}
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

// SSE clients for progress updates
const progressClients = {};

app.get('/api/last-run', (req, res) => {
  res.json({ lastRun: lastRunTime });
});

app.post('/api/update-run', (req, res) => {
  lastRunTime = new Date().toISOString();
  res.json({ lastRun: lastRunTime });
});

// ── Sources of Me ─────────────────────────────────────────────────
const SOURCES_FILE = path.join(__dirname, 'sources.json');

app.get('/api/sources', (req, res) => {
  try {
    const data = fs.existsSync(SOURCES_FILE) ? JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8')) : [];
    res.json({ sources: data });
  } catch (e) { res.json({ sources: [], error: e.message }); }
});

app.post('/api/update-sources', (req, res) => {
  try {
    const sources = req.body.sources || [];
    fs.writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2));
    lastRunTime = new Date().toISOString();
    // Trigger re-match in background (regenerate resumes with new sources)
    exec('python generate_all_resumes.py', { cwd: __dirname, timeout: 60000 }, (err) => {
      if (err) console.error('Regen failed:', err.message);
    });
    res.json({ ok: true, count: sources.length, lastRun: lastRunTime });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SSE endpoint for progress
app.get('/api/progress/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  progressClients[jobId] = res;
  req.on('close', () => { delete progressClients[jobId]; });
});

function sendProgress(jobId, step, pct, msg) {
  if (progressClients[jobId]) {
    progressClients[jobId].write(`data: ${JSON.stringify({ step, pct, msg })}\n\n`);
  }
}

// Tailor resume endpoint
app.post('/api/tailor-resume', async (req, res) => {
  const { jobId, jobTitle, company, jobUrl, blurb, resumeText, missingGaps, email } = req.body;

  try {
    // Step 1: Scrape job posting
    sendProgress(jobId, 1, 10, 'Launching headless browser...');
    let puppeteer;
    try {
      puppeteer = require('puppeteer');
    } catch (e) {
      sendProgress(jobId, 1, 10, 'Puppeteer not ready, using cached job data...');
    }

    let scrapedDescription = blurb;
    if (puppeteer) {
      sendProgress(jobId, 1, 20, 'Scraping job posting from ' + new URL(jobUrl).hostname + '...');
      try {
        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(jobUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        sendProgress(jobId, 1, 35, 'Extracting job description...');
        scrapedDescription = await page.evaluate(() => {
          const selectors = [
            '[class*="description"]', '[class*="job-desc"]', '[class*="posting"]',
            '[class*="content"]', 'article', 'main', '.job-details', '#job-description'
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim().length > 100) return el.textContent.trim().substring(0, 3000);
          }
          return document.body.textContent.trim().substring(0, 3000);
        });
        await browser.close();
        sendProgress(jobId, 1, 45, 'Job description scraped successfully');
      } catch (scrapeErr) {
        sendProgress(jobId, 1, 45, 'Could not scrape live page, using cached description');
      }
    } else {
      sendProgress(jobId, 1, 45, 'Using cached job description');
    }

    // Step 2: Generate tailored PDF
    sendProgress(jobId, 2, 55, 'Generating tailored resume PDF...');

    const gapsList = missingGaps.map((g, i) => `${i + 1}. ${g.label} -- ${g.sub}`).join('\n');

    const resumeHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Rubik:wght@500&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Inter',sans-serif;color:#2d3748;line-height:1.5;padding:40px 50px;max-width:800px;margin:0 auto;}
  .header{text-align:center;margin-bottom:20px;border-bottom:2px solid #2563eb;padding-bottom:15px;}
  .name{font-family:'Rubik',sans-serif;font-size:28px;font-weight:500;color:#1a202c;letter-spacing:1px;}
  .contact{font-size:11px;color:#64748b;margin-top:6px;}
  .subtitle{font-size:13px;color:#2563eb;font-weight:600;margin-top:4px;}
  .section{margin-top:18px;}
  .section-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#1a202c;border-bottom:1.5px solid #e2e8f0;padding-bottom:4px;margin-bottom:10px;}
  .summary{font-size:11.5px;line-height:1.7;color:#4a5568;}
  .job{margin-bottom:14px;}
  .job-header{display:flex;justify-content:space-between;align-items:baseline;}
  .job-title{font-size:12.5px;font-weight:700;color:#1a202c;}
  .job-co{font-size:12px;font-weight:600;color:#2563eb;}
  .job-meta{font-size:10.5px;color:#94a3b8;}
  .bullet{font-size:11px;line-height:1.7;color:#4a5568;padding-left:16px;position:relative;margin-top:3px;}
  .bullet::before{content:'\\2022';position:absolute;left:2px;color:#2563eb;}
  .achievement{background:#f0f4ff;border-radius:6px;padding:10px 14px;margin-top:8px;border-left:3px solid #2563eb;}
  .achievement-title{font-size:11.5px;font-weight:700;color:#2563eb;}
  .achievement-text{font-size:11px;color:#4a5568;margin-top:2px;}
  .skills{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
  .skill{font-size:10px;padding:3px 10px;background:#f1f5f9;border-radius:4px;color:#475569;font-weight:500;}
  .tailored-note{margin-top:20px;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:10.5px;color:#15803d;}
  .tailored-note strong{display:block;margin-bottom:4px;}
  .gap-item{font-size:10.5px;margin-top:3px;}
</style></head><body>
<div class="header">
  <div class="name">KYLE GAARDER</div>
  <div class="contact">Austin, TX &middot; kylegaarder@gmail.com &middot; linkedin.com/in/kylegaarder</div>
  <div class="subtitle">Tailored for ${jobTitle} at ${company}</div>
</div>
${resumeText.split('\n').map(line => {
  if (!line.trim()) return '';
  if (line.match(/^[A-Z\s&]+$/) && line.trim().length > 2 && line.trim() !== 'KYLE GAARDER')
    return `<div class="section"><div class="section-title">${line.trim()}</div></div>`;
  if (line.startsWith('\u00b7') || line.startsWith('·'))
    return `<div class="bullet">${line.replace(/^[·\u00b7]\s*/, '')}</div>`;
  if (line.includes('WHY '))
    return `<div class="achievement"><div class="achievement-title">${line.split(':')[0] || line.split(' -- ')[0]}</div><div class="achievement-text">${line.includes(':') ? line.split(':').slice(1).join(':') : line.includes(' -- ') ? line.split(' -- ').slice(1).join(' -- ') : ''}</div></div>`;
  return `<div class="summary">${line}</div>`;
}).join('\n')}
<div class="tailored-note">
  <strong>Resume tailored for ${jobTitle} at ${company}</strong>
  <div>The following ${missingGaps.length} areas were identified as gaps and addressed in this version</div>
  ${missingGaps.map((g, i) => `<div class="gap-item"><strong>${i + 1}. ${g.label}</strong> -- ${g.sub}</div>`).join('')}
</div>
</body></html>`;

    sendProgress(jobId, 2, 70, 'Rendering PDF with headless browser...');

    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
    const pdfPath = path.join(outputDir, `Kyle_Resume_${jobId}_${Date.now()}.pdf`);

    if (puppeteer) {
      const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(resumeHtml, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: pdfPath,
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.3in', bottom: '0.3in', left: '0.3in', right: '0.3in' }
      });
      await browser.close();
    } else {
      fs.writeFileSync(pdfPath.replace('.pdf', '.html'), resumeHtml);
    }

    sendProgress(jobId, 2, 85, 'PDF generated successfully');

    // Step 3: Email the PDF
    sendProgress(jobId, 3, 90, `Emailing to ${email}...`);

    const pdfFilename = path.basename(pdfPath);
    const gapsForEmail = missingGaps.map((g, i) => `${i + 1}. ${g.label} - ${g.sub}`).join('\\n');

    // Use gws gmail to send
    const subject = `Tailored Resume - ${jobTitle} at ${company}`;
    const body = `Here is Kyle's resume tailored for the ${jobTitle} role at ${company}.\\n\\nJob Posting: ${jobUrl}\\n\\n${missingGaps.length} gaps addressed in this version:\\n${gapsForEmail}\\n\\nScraped job description preview:\\n${scrapedDescription.substring(0, 500)}...`;

    try {
      const gapsSummary = missingGaps.map((g, i) => `${i + 1}. ${g.label} - ${g.sub}`).join('\n');
      const emailBody = `Here is Kyle's resume tailored for the ${jobTitle} role at ${company}.\n\nJob Posting: ${jobUrl}\n\n${missingGaps.length} gaps addressed in this version:\n${gapsSummary}\n\nScraped job description preview:\n${scrapedDescription.substring(0, 500)}...\n\nGenerated by Kyle's Kickass Kareer Board`;

      const gwsCmd = `gws gmail +send --to "${email}" --subject "${subject}" --body "${emailBody.replace(/"/g, '\\"').replace(/\n/g, '\n')}" -a "${pdfPath}"`;

      await new Promise((resolve, reject) => {
        exec(gwsCmd, { timeout: 30000 }, (err, stdout, stderr) => {
          if (err) {
            sendProgress(jobId, 3, 95, 'PDF generated but email failed - download instead');
            reject(err);
          } else {
            sendProgress(jobId, 3, 95, `Email sent to ${email}`);
            resolve(stdout);
          }
        });
      });
    } catch (emailErr) {
      sendProgress(jobId, 3, 95, 'PDF generated - email send failed, download the PDF below');
    }

    sendProgress(jobId, 4, 100, 'Done! Check your inbox.');

    // Update last run
    lastRunTime = new Date().toISOString();

    res.json({
      success: true,
      pdfPath: `/output/${pdfFilename}`,
      scrapedLength: scrapedDescription.length,
      email: email
    });

  } catch (err) {
    sendProgress(jobId, 0, 0, 'Error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve generated PDFs
app.use('/output', express.static(path.join(__dirname, 'output')));

app.get('/api/find-email', async (req, res) => {
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

app.get('/api/domain-search', async (req, res) => {
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

// ── ATS Company Portals ──────────────────────────────────────────
const ATS_COMPANIES = [
  // Greenhouse
  { slug: 'stripe', name: 'Stripe', platform: 'greenhouse', tags: ['fintech', 'payments', 'engineering', 'developer tools', 'saas'] },
  { slug: 'notion', name: 'Notion', platform: 'greenhouse', tags: ['productivity', 'saas', 'engineering', 'design', 'developer tools'] },
  { slug: 'figma', name: 'Figma', platform: 'greenhouse', tags: ['design', 'saas', 'engineering', 'product', 'developer tools'] },
  { slug: 'airtable', name: 'Airtable', platform: 'greenhouse', tags: ['productivity', 'saas', 'engineering', 'product', 'developer tools'] },
  { slug: 'plaid', name: 'Plaid', platform: 'greenhouse', tags: ['fintech', 'payments', 'engineering', 'developer tools', 'b2b'] },
  { slug: 'webflow', name: 'Webflow', platform: 'greenhouse', tags: ['design', 'saas', 'engineering', 'developer tools', 'product'] },
  { slug: 'loom', name: 'Loom', platform: 'greenhouse', tags: ['productivity', 'saas', 'engineering', 'product', 'growth'] },
  { slug: 'retool', name: 'Retool', platform: 'greenhouse', tags: ['developer tools', 'saas', 'engineering', 'product', 'b2b'] },
  { slug: 'linear', name: 'Linear', platform: 'greenhouse', tags: ['developer tools', 'saas', 'engineering', 'product', 'productivity'] },
  { slug: 'vercel', name: 'Vercel', platform: 'greenhouse', tags: ['developer tools', 'engineering', 'saas', 'product', 'growth'] },
  { slug: 'airbnb', name: 'Airbnb', platform: 'greenhouse', tags: ['hospitality', 'travel', 'marketplace', 'community', 'product'] },
  { slug: 'sonder', name: 'Sonder', platform: 'greenhouse', tags: ['hospitality', 'travel', 'real estate', 'operations', 'property management'] },
  { slug: 'industrious', name: 'Industrious', platform: 'greenhouse', tags: ['coworking', 'real estate', 'hospitality', 'community', 'operations'] },
  { slug: 'hipcamp', name: 'Hipcamp', platform: 'greenhouse', tags: ['outdoor', 'marketplace', 'hospitality', 'community', 'travel'] },
  { slug: 'common', name: 'Common', platform: 'greenhouse', tags: ['coliving', 'real estate', 'community', 'property management', 'proptech'] },
  { slug: 'selina', name: 'Selina', platform: 'greenhouse', tags: ['hospitality', 'coliving', 'travel', 'community', 'operations'] },
  { slug: 'vacasa', name: 'Vacasa', platform: 'greenhouse', tags: ['hospitality', 'property management', 'travel', 'real estate', 'operations'] },
  { slug: 'pacaso', name: 'Pacaso', platform: 'greenhouse', tags: ['real estate', 'proptech', 'marketplace', 'property management', 'consumer'] },
  { slug: 'thumbtack', name: 'Thumbtack', platform: 'greenhouse', tags: ['marketplace', 'consumer', 'local', 'operations', 'growth'] },
  { slug: 'rover', name: 'Rover', platform: 'greenhouse', tags: ['marketplace', 'consumer', 'community', 'operations', 'growth'] },
  { slug: 'faire', name: 'Faire', platform: 'greenhouse', tags: ['marketplace', 'b2b', 'operations', 'logistics', 'growth'] },
  { slug: 'taskrabbit', name: 'TaskRabbit', platform: 'greenhouse', tags: ['marketplace', 'consumer', 'local', 'operations', 'community'] },
  { slug: 'duolingo', name: 'Duolingo', platform: 'greenhouse', tags: ['edtech', 'consumer', 'product', 'growth', 'design'] },
  { slug: 'alltrails', name: 'AllTrails', platform: 'greenhouse', tags: ['outdoor', 'consumer', 'community', 'product', 'growth'] },
  { slug: 'nextdoor', name: 'Nextdoor', platform: 'greenhouse', tags: ['social', 'local', 'community', 'consumer', 'growth'] },
  { slug: 'bumble', name: 'Bumble', platform: 'greenhouse', tags: ['consumer', 'social', 'product', 'growth', 'design'] },
  { slug: 'eventbrite', name: 'Eventbrite', platform: 'greenhouse', tags: ['events', 'marketplace', 'consumer', 'community', 'operations'] },
  { slug: 'flexport', name: 'Flexport', platform: 'greenhouse', tags: ['logistics', 'supply chain', 'operations', 'b2b', 'engineering'] },
  { slug: 'rippling', name: 'Rippling', platform: 'greenhouse', tags: ['hr tech', 'people operations', 'saas', 'b2b', 'engineering'] },
  { slug: 'clipboard-health', name: 'Clipboard Health', platform: 'greenhouse', tags: ['healthcare', 'marketplace', 'operations', 'growth', 'engineering'] },
  // Ashby
  { slug: 'kindred', name: 'Kindred', platform: 'ashby', tags: ['coliving', 'community', 'hospitality', 'real estate', 'operations'] },
  { slug: 'ramp', name: 'Ramp', platform: 'ashby', tags: ['fintech', 'saas', 'b2b', 'engineering', 'growth'] },
  { slug: 'lattice', name: 'Lattice', platform: 'ashby', tags: ['hr tech', 'people operations', 'saas', 'b2b', 'product'] },
  { slug: 'watershed', name: 'Watershed', platform: 'ashby', tags: ['sustainability', 'esg', 'climate', 'saas', 'engineering'] },
  { slug: 'opensea', name: 'OpenSea', platform: 'ashby', tags: ['marketplace', 'engineering', 'product', 'consumer', 'design'] },
  { slug: 'assembly', name: 'Assembly', platform: 'ashby', tags: ['hr tech', 'people operations', 'saas', 'community', 'product'] },
  // Lever
  { slug: 'peerstreet', name: 'PeerStreet', platform: 'lever', tags: ['fintech', 'real estate', 'proptech', 'marketplace', 'engineering'] },
  { slug: 'landed', name: 'Landed', platform: 'lever', tags: ['real estate', 'fintech', 'proptech', 'consumer', 'social'] },
  { slug: 'tripactions', name: 'TripActions', platform: 'lever', tags: ['travel', 'saas', 'b2b', 'operations', 'fintech'] },
  { slug: 'samsara', name: 'Samsara', platform: 'lever', tags: ['iot', 'logistics', 'operations', 'engineering', 'b2b'] },
  { slug: 'gusto', name: 'Gusto', platform: 'lever', tags: ['hr tech', 'people operations', 'fintech', 'saas', 'b2b'] },
  { slug: 'calm', name: 'Calm', platform: 'lever', tags: ['wellness', 'consumer', 'product', 'growth', 'design'] },
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
    return titleTerms.some(term => t.includes(term) || term.split(/\s+/).some(w => w.length >= 4 && t.includes(w)));
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
    const [generalJobs, atsJobs] = await Promise.all([
      fetchAllJobs(),
      fetchATSJobs(selectedCompanies, keywords)
    ]);

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

    if (location === 'remote') {
      scored = scored.filter(j => {
        const loc = (j.location || '').toLowerCase();
        const isRemote = /remote/i.test(loc) || j.remote;
        if (!isRemote) return false;
        // Exclude explicitly non-US remote jobs
        const nonUS = /\b(india|europe|emea|apac|uk|germany|france|spain|brazil|nigeria|philippines|pakistan|latam|latin america|asia|africa|middle east)\b/i;
        if (nonUS.test(loc)) return false;
        return true;
      });
    } else if (location === 'austin') {
      scored = scored.filter(j => /austin/i.test(j.location));
    }

    const top = scored.slice(0, 20);
    // Dynamic tiers: top 20% = hot, next 30% = strong, rest = good
    const count = top.length;
    const hotCut = Math.max(1, Math.floor(count * 0.2));
    const strongCut = Math.max(hotCut + 1, Math.floor(count * 0.5));
    top.forEach((j, i) => {
      if (j.fit >= 80) j.tier = 'hot';
      else if (j.fit >= 60) j.tier = i < hotCut ? 'hot' : 'strong';
      else { j.tier = i < hotCut ? 'hot' : i < strongCut ? 'strong' : 'good'; }
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

  // 1. Extract job titles from resume
  const titleRe = /\b(?:senior|staff|lead|principal|chief|head|junior|associate|director|vp of)?\s*(?:product|program|project|engineering|software|data|marketing|sales|operations|finance|design|ux|ui|research|business|customer|growth|content|community|full[- ]?stack|front[- ]?end|back[- ]?end|devops|cloud|security|general|account|event|member|experience|hospitality|coworking|real estate)\s*(?:manager|engineer|designer|analyst|director|specialist|coordinator|developer|architect|scientist|lead|officer|strategist|consultant|planner|associate)\b/gi;
  const titles = [...new Set([...text.matchAll(titleRe)].map(m => m[0].trim().toLowerCase()))];

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
  const jobText = ((job.title || '') + ' ' + (job.description || '') + ' ' +
    (Array.isArray(job.tags) ? job.tags.join(' ') : '') + ' ' +
    (job.category || '')).toLowerCase();
  const jobTitle = (job.title || '').toLowerCase();

  let titleScore = 0;
  let skillCount = 0;
  let wordCount = 0;
  let bigramCount = 0;

  // Job title matches resume titles (e.g. "product manager" in "Senior Product Manager")
  keywords.titles.forEach(t => {
    if (jobText.includes(t)) titleScore += 15;
    else {
      const words = t.split(/\s+/).filter(w => w.length >= 3);
      const matched = words.filter(w => jobTitle.includes(w)).length;
      if (matched > 0) titleScore += Math.round((matched / words.length) * 10);
    }
  });

  // Domain skills found in job posting
  keywords.domainSkills.forEach(s => { if (jobText.includes(s)) skillCount++; });

  // Resume-specific words found in job
  keywords.specificWords.forEach(w => {
    if (jobTitle.includes(w)) wordCount += 2;
    else if (jobText.includes(w)) wordCount++;
  });

  // Bigram matches
  keywords.specificBigrams.forEach(bg => { if (jobText.includes(bg)) bigramCount++; });

  // Core scoring dimensions (same as before but base reduced)
  const base = 15;
  const titleBonus = Math.min(25, titleScore);
  const skillBonus = Math.min(30, skillCount * 5);   // 6+ skill matches = max
  const wordBonus = Math.min(15, wordCount * 2);      // 8+ word matches = max
  const bigramBonus = Math.min(8, bigramCount * 4);    // 2+ bigram matches = max

  // New dimensions
  // Posting freshness
  const days = parseDaysAgo(job.posted);
  let freshnessBonus = 0;
  if (days !== null) {
    if (days <= 7) freshnessBonus = 10;
    else if (days <= 14) freshnessBonus = 5;
    else if (days <= 30) freshnessBonus = 0;
    else freshnessBonus = -5;
  }

  // Salary alignment
  let salaryBonus = 0;
  const salaryMid = parseSalaryMid(job.salary);
  if (salaryMid !== null && salaryMid >= 40000 && salaryMid <= 300000) {
    salaryBonus = 5;
  }

  // Location fit
  let locationBonus = 0;
  const loc = (job.location || '').toLowerCase();
  if (/austin/i.test(loc)) locationBonus = 5;
  else if (/remote/i.test(loc) || job.remote) locationBonus = 3;

  const raw = base + titleBonus + skillBonus + wordBonus + bigramBonus + freshnessBonus + salaryBonus + locationBonus;
  return Math.max(5, Math.min(98, raw));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Your Job Board running on port ${PORT}`));
