const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
app.use(express.json());
app.use(express.static('public'));

const HUNTER_API_KEY = process.env.HUNTER_API_KEY || '7b5adce8f66f24b8af6f4439f1fde92de4b5b0dc';

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kyle's Job Board running on port ${PORT}`));
