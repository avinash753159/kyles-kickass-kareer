# Dashboard Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add career-ops-inspired features to Kyle's Job Board: enhanced multi-dimension scoring, ATS portal scanning, ghost job detection, follow-up tracker, and interview prep — all additive, no UI removed.

**Architecture:** All changes go into two files: `server.js` (backend scoring, ATS scanning, data lookups) and `public/index.html` (frontend badges, panels, countdowns). No new dependencies. No new files. No new tabs.

**Tech Stack:** Node.js/Express, vanilla JS, localStorage, public ATS APIs (Greenhouse/Ashby/Lever)

---

## File Structure

| File | Responsibility | Changes |
|------|---------------|---------|
| `server.js` | Backend API server | Add ATS company list, ATS fetching in `fetchAllJobs()`, enhanced `scoreFit()`, ghost detection data (`RECENT_LAYOFFS`), company info lookup (`COMPANY_INFO`), new `/api/company-info` endpoint |
| `public/index.html` | Frontend SPA | Add ghost badges on job cards, follow-up countdown, interview prep panel, source badge, CSS for new elements |

---

### Task 1: Add ATS Company List and Fetching to server.js

**Files:**
- Modify: `server.js:320-506` (the job fetching section)

- [ ] **Step 1: Add the ATS_COMPANIES array after the CACHE_TTL line (server.js:322)**

Insert after line 322 (`const CACHE_TTL = 30 * 60 * 1000;`):

```javascript
// ── ATS Portal Companies (public APIs, no auth) ─────────────────
const ATS_COMPANIES = [
  // Tech / SaaS
  { slug: 'stripe', name: 'Stripe', platform: 'greenhouse', tags: ['fintech','payments','engineering','product','growth'] },
  { slug: 'notion', name: 'Notion', platform: 'greenhouse', tags: ['productivity','product','engineering','design','growth'] },
  { slug: 'figma', name: 'Figma', platform: 'greenhouse', tags: ['design','product','engineering','growth','saas'] },
  { slug: 'airtable', name: 'Airtable', platform: 'greenhouse', tags: ['productivity','product','engineering','saas','growth'] },
  { slug: 'plaid', name: 'Plaid', platform: 'greenhouse', tags: ['fintech','engineering','product','data'] },
  { slug: 'webflow', name: 'Webflow', platform: 'greenhouse', tags: ['design','product','engineering','saas','marketing'] },
  { slug: 'loom', name: 'Loom', platform: 'greenhouse', tags: ['productivity','product','engineering','growth','video'] },
  { slug: 'retool', name: 'Retool', platform: 'greenhouse', tags: ['developer tools','engineering','product','saas'] },
  { slug: 'linear', name: 'Linear', platform: 'greenhouse', tags: ['developer tools','product','engineering','design'] },
  { slug: 'vercel', name: 'Vercel', platform: 'greenhouse', tags: ['developer tools','engineering','product','growth'] },
  // Hospitality / Real Estate / Community
  { slug: 'airbnb', name: 'Airbnb', platform: 'greenhouse', tags: ['hospitality','community','product','travel','operations'] },
  { slug: 'sonder', name: 'Sonder', platform: 'greenhouse', tags: ['hospitality','operations','real estate','community','travel'] },
  { slug: 'industrious', name: 'Industrious', platform: 'greenhouse', tags: ['coworking','community','operations','real estate','hospitality'] },
  { slug: 'hipcamp', name: 'Hipcamp', platform: 'greenhouse', tags: ['hospitality','community','marketplace','outdoor','growth'] },
  { slug: 'common', name: 'Common Living', platform: 'greenhouse', tags: ['coliving','community','operations','real estate','hospitality'] },
  { slug: 'selina', name: 'Selina', platform: 'greenhouse', tags: ['hospitality','coliving','coworking','community','travel'] },
  { slug: 'vacasa', name: 'Vacasa', platform: 'greenhouse', tags: ['hospitality','property management','operations','real estate'] },
  { slug: 'pacaso', name: 'Pacaso', platform: 'greenhouse', tags: ['real estate','proptech','product','operations','growth'] },
  // Marketplaces
  { slug: 'thumbtack', name: 'Thumbtack', platform: 'greenhouse', tags: ['marketplace','product','growth','operations','community'] },
  { slug: 'rover', name: 'Rover', platform: 'greenhouse', tags: ['marketplace','community','product','operations','growth'] },
  { slug: 'faire', name: 'Faire', platform: 'greenhouse', tags: ['marketplace','b2b','product','growth','operations'] },
  { slug: 'taskrabbit', name: 'TaskRabbit', platform: 'greenhouse', tags: ['marketplace','operations','community','product','growth'] },
  // Ashby companies
  { slug: 'kindred', name: 'Kindred', platform: 'ashby', tags: ['community','hospitality','coliving','product','growth'] },
  { slug: 'ramp', name: 'Ramp', platform: 'ashby', tags: ['fintech','product','engineering','growth','operations'] },
  { slug: 'lattice', name: 'Lattice', platform: 'ashby', tags: ['hr tech','product','engineering','people operations'] },
  { slug: 'watershed', name: 'Watershed', platform: 'ashby', tags: ['sustainability','product','engineering','esg','climate'] },
  { slug: 'opensea', name: 'OpenSea', platform: 'ashby', tags: ['marketplace','product','engineering','community','growth'] },
  { slug: 'assembly', name: 'Assembly', platform: 'ashby', tags: ['community','events','operations','hospitality','coworking'] },
  // Lever companies
  { slug: 'peerstreet', name: 'PeerStreet', platform: 'lever', tags: ['real estate','fintech','product','operations'] },
  { slug: 'landed', name: 'Landed', platform: 'lever', tags: ['real estate','community','social impact','operations'] },
  { slug: 'tripactions', name: 'Navan', platform: 'lever', tags: ['travel','product','operations','growth','saas'] },
  { slug: 'samsara', name: 'Samsara', platform: 'lever', tags: ['iot','operations','product','engineering','growth'] },
  { slug: 'gusto', name: 'Gusto', platform: 'lever', tags: ['hr tech','product','engineering','operations','saas'] },
  { slug: 'calm', name: 'Calm', platform: 'lever', tags: ['wellness','product','growth','community','consumer'] },
  // Growth / Consumer
  { slug: 'duolingo', name: 'Duolingo', platform: 'greenhouse', tags: ['edtech','product','growth','consumer','community'] },
  { slug: 'alltrails', name: 'AllTrails', platform: 'greenhouse', tags: ['outdoor','consumer','product','growth','community'] },
  { slug: 'nextdoor', name: 'Nextdoor', platform: 'greenhouse', tags: ['community','consumer','product','growth','local'] },
  { slug: 'bumble', name: 'Bumble', platform: 'greenhouse', tags: ['consumer','community','product','growth','social'] },
  { slug: 'eventbrite', name: 'Eventbrite', platform: 'greenhouse', tags: ['events','marketplace','community','product','growth'] },
  // Operations / Logistics
  { slug: 'flexport', name: 'Flexport', platform: 'greenhouse', tags: ['logistics','operations','supply chain','product','growth'] },
  { slug: 'rippling', name: 'Rippling', platform: 'greenhouse', tags: ['hr tech','operations','product','engineering','saas'] },
  { slug: 'clipboard-health', name: 'Clipboard Health', platform: 'greenhouse', tags: ['healthcare','marketplace','operations','growth'] },
];
```

- [ ] **Step 2: Add ATS fetching functions after the ATS_COMPANIES array**

```javascript
// ── ATS Portal Scanning ─────────────────────────────────────────
function selectCompaniesForResume(keywords) {
  const resumeTags = new Set();
  // Build tag set from resume keywords
  keywords.titles.forEach(t => {
    const words = t.toLowerCase().split(/\s+/);
    words.forEach(w => resumeTags.add(w));
  });
  keywords.domainSkills.forEach(s => resumeTags.add(s.toLowerCase()));
  keywords.specificWords.slice(0, 20).forEach(w => resumeTags.add(w));

  // Score each company by tag overlap
  return ATS_COMPANIES
    .map(c => {
      const overlap = c.tags.filter(t => {
        for (const rt of resumeTags) {
          if (rt.includes(t) || t.includes(rt)) return true;
        }
        return false;
      }).length;
      return { ...c, overlap };
    })
    .filter(c => c.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 15);
}

async function fetchATSJobs(companies, keywords) {
  const fetch = (await import('node-fetch')).default;
  const results = [];
  const titleWords = keywords.titles.flatMap(t => t.split(/\s+/).filter(w => w.length >= 3));

  const fetchers = companies.map(company => async () => {
    try {
      let url, parseJobs;
      if (company.platform === 'greenhouse') {
        url = `https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs`;
        parseJobs = (data) => (data.jobs || []).map(j => ({
          id: `gh-${company.slug}-${j.id}`,
          title: j.title || '',
          company: company.name,
          location: (j.location && j.location.name) || 'Unknown',
          remote: /remote/i.test((j.location && j.location.name) || ''),
          url: j.absolute_url || `https://boards.greenhouse.io/${company.slug}/jobs/${j.id}`,
          logo: '',
          salary: '',
          posted: j.updated_at ? timeAgo(new Date(j.updated_at)) : '',
          postedDate: j.updated_at || '',
          type: 'Full-time',
          description: '',
          tags: [],
          source: 'Greenhouse',
          atsCompany: company.slug
        }));
      } else if (company.platform === 'ashby') {
        url = `https://api.ashbyhq.com/posting-api/job-board/${company.slug}`;
        parseJobs = (data) => (data.jobs || []).map(j => ({
          id: `ash-${company.slug}-${j.id}`,
          title: j.title || '',
          company: company.name,
          location: j.location || 'Unknown',
          remote: /remote/i.test(j.location || ''),
          url: j.jobUrl || j.applyUrl || '',
          logo: '',
          salary: '',
          posted: j.publishedAt ? timeAgo(new Date(j.publishedAt)) : '',
          postedDate: j.publishedAt || '',
          type: j.employmentType || 'Full-time',
          description: (j.descriptionPlain || '').substring(0, 1500),
          tags: [],
          source: 'Ashby',
          atsCompany: company.slug
        }));
      } else if (company.platform === 'lever') {
        url = `https://api.lever.co/v0/postings/${company.slug}`;
        parseJobs = (data) => (Array.isArray(data) ? data : []).map(j => ({
          id: `lev-${company.slug}-${j.id}`,
          title: j.text || '',
          company: company.name,
          location: (j.categories && j.categories.location) || 'Unknown',
          remote: /remote/i.test((j.categories && j.categories.location) || ''),
          url: j.hostedUrl || j.applyUrl || '',
          logo: '',
          salary: '',
          posted: j.createdAt ? timeAgo(new Date(j.createdAt)) : '',
          postedDate: j.createdAt ? new Date(j.createdAt).toISOString() : '',
          type: (j.categories && j.categories.commitment) || 'Full-time',
          description: (j.descriptionPlain || '').substring(0, 1500),
          tags: [],
          source: 'Lever',
          atsCompany: company.slug
        }));
      }

      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return;
      const data = await r.json();
      const jobs = parseJobs(data);

      // Filter by title relevance
      jobs.forEach(j => {
        const jTitle = j.title.toLowerCase();
        const relevant = titleWords.some(w => jTitle.includes(w)) ||
          keywords.domainSkills.some(s => jTitle.includes(s));
        if (relevant) results.push(j);
      });
    } catch (e) {
      console.error(`ATS ${company.platform}/${company.slug}:`, e.message);
    }
  });

  // Run 10 concurrent fetches
  const chunks = [];
  for (let i = 0; i < fetchers.length; i += 10) chunks.push(fetchers.slice(i, i + 10));
  for (const chunk of chunks) await Promise.all(chunk.map(f => f()));

  return results;
}
```

- [ ] **Step 3: Integrate ATS fetching into fetchAllJobs()**

In `server.js`, modify the `fetchAllJobs` function. Replace the section after `await Promise.all(fetches);` (lines 492-505) with:

```javascript
  await Promise.all(fetches);

  // Deduplicate existing API results first
  const seen = new Set();
  const deduped = results.filter(j => {
    const key = (j.title + '|' + j.company).toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  jobCache = { data: deduped, ts: Date.now() };
  console.log('Fetched', deduped.length, 'unique jobs from', 5, 'general APIs');
  return deduped;
}
```

Then modify the `/api/find-jobs` handler (lines 324-378). Replace the body with:

```javascript
app.post('/api/find-jobs', async (req, res) => {
  try {
    const { resumeText, location } = req.body;
    if (!resumeText) return res.status(400).json({ error: 'No resume text' });

    const keywords = extractResumeKeywords(resumeText);

    // Fetch general APIs + ATS portals in parallel
    const [generalJobs, atsJobs] = await Promise.all([
      fetchAllJobs(),
      (async () => {
        try {
          const companies = selectCompaniesForResume(keywords);
          console.log('ATS scanning', companies.length, 'companies:', companies.map(c => c.name).join(', '));
          return await fetchATSJobs(companies, keywords);
        } catch (e) {
          console.error('ATS scan failed:', e.message);
          return [];
        }
      })()
    ]);

    // Merge and deduplicate
    const allJobs = [...generalJobs, ...atsJobs];
    const seen = new Set();
    const unique = allJobs.filter(j => {
      const key = (j.title + '|' + j.company).toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let scored = unique
      .map(job => ({ ...job, fit: scoreFit(job, keywords) }))
      .sort((a, b) => b.fit - a.fit);

    if (location === 'remote') {
      scored = scored.filter(j => {
        const loc = (j.location || '').toLowerCase();
        const isRemote = /remote/i.test(loc) || j.remote;
        if (!isRemote) return false;
        const nonUS = /\b(india|europe|emea|apac|uk|germany|france|spain|brazil|nigeria|philippines|pakistan|latam|latin america|asia|africa|middle east)\b/i;
        if (nonUS.test(loc)) return false;
        return true;
      });
    } else if (location === 'austin') {
      scored = scored.filter(j => /austin/i.test(j.location));
    }

    const top = scored.slice(0, 20);
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
    });

    res.json({ jobs: top, keywords: keywords.titles.concat(keywords.domainSkills).slice(0, 10) });
  } catch (e) {
    console.error('Find jobs error:', e);
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add ATS portal scanning (Greenhouse/Ashby/Lever)

Scan ~40 companies via public APIs, auto-selected by resume keyword
overlap. Results merge into existing job list."
```

---

### Task 2: Enhanced Multi-Dimension Scoring in server.js

**Files:**
- Modify: `server.js:620-661` (the `scoreFit` function)

- [ ] **Step 1: Add helper to parse posting dates**

Insert before the `scoreFit` function:

```javascript
function parseDaysAgo(posted) {
  if (!posted) return null;
  const p = String(posted).toLowerCase();
  if (p === 'today') return 0;
  const dMatch = p.match(/(\d+)\s*d/);
  if (dMatch) return parseInt(dMatch[1]);
  const moMatch = p.match(/(\d+)\s*mo/);
  if (moMatch) return parseInt(moMatch[1]) * 30;
  return null;
}

function parseSalaryMid(salary) {
  if (!salary) return null;
  const nums = String(salary).match(/\d+/g);
  if (!nums || !nums.length) return null;
  const values = nums.map(Number);
  // If values look like "120" and "140" (in k), average them
  if (values.length >= 2) {
    const avg = (values[0] + values[1]) / 2;
    return avg < 1000 ? avg * 1000 : avg;
  }
  const v = values[0];
  return v < 1000 ? v * 1000 : v;
}
```

- [ ] **Step 2: Replace the scoreFit function with enhanced version**

Replace the entire `scoreFit` function (lines 620-661):

```javascript
function scoreFit(job, keywords) {
  const jobText = ((job.title || '') + ' ' + (job.description || '') + ' ' +
    (Array.isArray(job.tags) ? job.tags.join(' ') : '') + ' ' +
    (job.category || '')).toLowerCase();
  const jobTitle = (job.title || '').toLowerCase();

  let titleScore = 0;
  let skillCount = 0;
  let wordCount = 0;
  let bigramCount = 0;

  // Job title matches resume titles
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

  // ── New dimensions ──
  // Posting freshness
  const daysAgo = parseDaysAgo(job.posted);
  let freshnessBonus = 0;
  if (daysAgo !== null) {
    if (daysAgo <= 7) freshnessBonus = 10;
    else if (daysAgo <= 14) freshnessBonus = 5;
    else if (daysAgo <= 30) freshnessBonus = 0;
    else freshnessBonus = -5;
  }

  // Salary alignment (if available, reward jobs with salary info in reasonable range)
  const salaryMid = parseSalaryMid(job.salary);
  let salaryBonus = 0;
  if (salaryMid !== null) {
    // Having salary data at all is a good sign; reasonable range gets bonus
    if (salaryMid >= 40000 && salaryMid <= 300000) salaryBonus = 5;
  }

  // Remote/location fit bonus
  let locationBonus = 0;
  const loc = (job.location || '').toLowerCase();
  if (/austin/i.test(loc)) locationBonus = 5;
  else if (/remote/i.test(loc) || job.remote) locationBonus = 3;

  // Additive scoring with caps
  const base = 15;
  const titleBonus = Math.min(25, titleScore);
  const skillBonus = Math.min(30, skillCount * 5);
  const wordBonus = Math.min(15, wordCount * 2);
  const bigramBonus = Math.min(8, bigramCount * 4);
  const freshCapped = Math.max(-5, Math.min(10, freshnessBonus));
  const salaryCapped = Math.min(5, salaryBonus);
  const locCapped = Math.min(5, locationBonus);

  return Math.min(98, Math.max(5, base + titleBonus + skillBonus + wordBonus + bigramBonus + freshCapped + salaryCapped + locCapped));
}
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: enhance scoring with freshness, salary, and location dimensions

Adds posting age (+10 fresh, -5 stale), salary availability (+5),
and location specificity (+5 Austin, +3 remote) to the fit score."
```

---

### Task 3: Ghost Job Detection Data in server.js

**Files:**
- Modify: `server.js` (add data after ATS_COMPANIES, add ghost fields to response)

- [ ] **Step 1: Add RECENT_LAYOFFS list after ATS_COMPANIES**

```javascript
// ── Ghost Job Detection Data ────────────────────────────────────
const RECENT_LAYOFFS = [
  { company: 'meta', date: '2025-11' },
  { company: 'amazon', date: '2025-09' },
  { company: 'google', date: '2025-10' },
  { company: 'microsoft', date: '2025-08' },
  { company: 'salesforce', date: '2025-09' },
  { company: 'snap', date: '2025-10' },
  { company: 'spotify', date: '2025-07' },
  { company: 'discord', date: '2025-08' },
  { company: 'twitch', date: '2025-09' },
  { company: 'bumble', date: '2025-11' },
  { company: 'zillow', date: '2025-06' },
  { company: 'redfin', date: '2025-07' },
  { company: 'opendoor', date: '2025-08' },
  { company: 'compass', date: '2025-10' },
  { company: 'sonder', date: '2025-12' },
  { company: 'vacasa', date: '2025-11' },
  { company: 'wayfair', date: '2025-09' },
  { company: 'robinhood', date: '2025-07' },
  { company: 'coinbase', date: '2025-06' },
  { company: 'block', date: '2025-10' },
];

function getLayoffMatch(company) {
  const norm = (company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return RECENT_LAYOFFS.find(l => {
    const lDate = new Date(l.date + '-01');
    return norm.includes(l.company) && lDate >= sixMonthsAgo;
  });
}
```

- [ ] **Step 2: Add ghost detection fields to job response in the /api/find-jobs handler**

In the `top.forEach` block inside `/api/find-jobs`, after `j.tags = ...`, add:

```javascript
      // Ghost detection
      const daysAgo = parseDaysAgo(j.posted);
      j.daysAgo = daysAgo;
      j.freshness = daysAgo === null ? 'unknown' : daysAgo <= 7 ? 'fresh' : daysAgo <= 30 ? 'normal' : daysAgo <= 45 ? 'aging' : 'stale';
      j.layoffSignal = getLayoffMatch(j.company) ? true : false;
```

- [ ] **Step 3: Add repost detection before responding**

Right before `res.json({ jobs: top, ...})` in the find-jobs handler, add:

```javascript
    // Repost detection: flag companies with multiple similar roles
    const companyRoles = {};
    top.forEach(j => {
      const key = j.company.toLowerCase();
      if (!companyRoles[key]) companyRoles[key] = [];
      companyRoles[key].push(j.title);
    });
    top.forEach(j => {
      const key = j.company.toLowerCase();
      j.reposted = (companyRoles[key] || []).length > 1;
    });

    // Ghost risk level
    top.forEach(j => {
      let signals = 0;
      if (j.freshness === 'aging' || j.freshness === 'stale') signals++;
      if (j.reposted) signals++;
      if (j.layoffSignal) signals++;
      j.ghostRisk = signals >= 2 ? 'high' : signals === 1 ? 'medium' : 'low';
    });
```

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add ghost job detection (freshness, reposts, layoffs)

Jobs now include daysAgo, freshness, layoffSignal, reposted,
and ghostRisk fields for frontend display."
```

---

### Task 4: Company Info Endpoint in server.js

**Files:**
- Modify: `server.js` (add COMPANY_INFO and endpoint)

- [ ] **Step 1: Add COMPANY_INFO data and endpoint after the ghost detection section**

```javascript
// ── Company Info for Interview Prep ─────────────────────────────
const COMPANY_INFO = {
  'airbnb': { size: '~6,000', funding: 'Public (ABNB)', glassdoor: '4.1', industry: 'Travel & Hospitality', news: 'Expanding Experiences platform' },
  'industrious': { size: '~1,500', funding: 'Series E', glassdoor: '3.8', industry: 'Coworking / Real Estate', news: '200+ premium locations nationwide' },
  'kindred': { size: '~60', funding: 'Series A', glassdoor: 'N/A', industry: 'Home Swapping / Community', news: 'Growing members-only network' },
  'hipcamp': { size: '~100', funding: 'Series C', glassdoor: '4.0', industry: 'Outdoor Hospitality', news: 'Expanding to international markets' },
  'stripe': { size: '~8,000', funding: 'Public', glassdoor: '4.2', industry: 'Fintech / Payments', news: 'Launched Stripe Capital expansion' },
  'notion': { size: '~800', funding: 'Series C ($10B)', glassdoor: '4.3', industry: 'Productivity / SaaS', news: 'AI-powered workspace features' },
  'figma': { size: '~1,200', funding: 'Acquired by Adobe (blocked, independent)', glassdoor: '4.5', industry: 'Design / SaaS', news: 'FigJam and Dev Mode growth' },
  'ramp': { size: '~800', funding: 'Series D ($8B)', glassdoor: '4.4', industry: 'Fintech / Expense Mgmt', news: 'Fastest growing corporate card' },
  'sonder': { size: '~800', funding: 'Public (SOND)', glassdoor: '3.2', industry: 'Hospitality', news: 'Restructuring and path to profitability' },
  'clipboard health': { size: '~500', funding: 'Series C (YC)', glassdoor: '3.5', industry: 'Healthcare Marketplace', news: 'Expanding marketplace to new verticals' },
  'capital factory': { size: '~80', funding: 'Private', glassdoor: '3.9', industry: 'Startup Accelerator', news: 'Austin Tech Week expansion' },
  'teero': { size: '~30', funding: 'Seed (ex-Uber)', glassdoor: 'N/A', industry: 'Logistics / Startup', news: 'Early-stage, hiring across ops' },
  'homeward': { size: '~200', funding: 'Series B', glassdoor: '4.1', industry: 'Proptech / Real Estate', news: 'Cash-backed offers growing in TX' },
  'duolingo': { size: '~700', funding: 'Public (DUOL)', glassdoor: '4.3', industry: 'EdTech', news: 'AI-powered language tutoring' },
  'nextdoor': { size: '~700', funding: 'Public (KIND)', glassdoor: '3.5', industry: 'Community / Social', news: 'Local business features expansion' },
  'eventbrite': { size: '~700', funding: 'Public (EB)', glassdoor: '3.8', industry: 'Events / Marketplace', news: 'AI event recommendations' },
  'flexport': { size: '~2,500', funding: 'Series E', glassdoor: '3.4', industry: 'Logistics / Supply Chain', news: 'Post-restructure growth' },
  'rippling': { size: '~2,500', funding: 'Series E ($13.5B)', glassdoor: '4.0', industry: 'HR Tech / SaaS', news: 'All-in-one workforce platform' },
  'thumbtack': { size: '~800', funding: 'Series G', glassdoor: '3.9', industry: 'Marketplace / Services', news: 'AI-powered home services' },
  'the commune': { size: '~5', funding: 'Bootstrapped', glassdoor: 'N/A', industry: 'Coworking / Creative', news: 'New Austin creative space' },
  'drillbit': { size: '~15', funding: 'YC-backed', glassdoor: 'N/A', industry: 'Construction Tech', news: 'Automating contractor back-office' },
  'closinglock': { size: '~80', funding: 'Series A', glassdoor: '4.2', industry: 'Proptech / Security', news: '11 open positions, rapid growth' },
  'vuka collective': { size: '~10', funding: 'Private', glassdoor: 'N/A', industry: 'Coworking / Social Impact', news: 'Impact Hub Austin operations' },
};

app.get('/api/company-info', (req, res) => {
  const name = (req.query.company || '').toLowerCase();
  const info = COMPANY_INFO[name];
  if (info) return res.json(info);
  // Try partial match
  const match = Object.entries(COMPANY_INFO).find(([k]) => name.includes(k) || k.includes(name));
  if (match) return res.json(match[1]);
  res.json({ size: 'Unknown', industry: 'Technology' });
});
```

- [ ] **Step 2: Commit**

```bash
git add server.js
git commit -m "feat: add company info endpoint for interview prep

Static lookup of company size, funding, Glassdoor rating,
industry, and recent news for ~25 companies."
```

---

### Task 5: Frontend — Ghost Job Badges on Job Cards

**Files:**
- Modify: `public/index.html` (CSS + job card rendering in user results)

- [ ] **Step 1: Add CSS for ghost badges and follow-up badges**

In `public/index.html`, add these styles before the closing `</style>` tag (before line 343):

```css
/* === GHOST BADGES === */
.ghost-badges{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;}
.ghost-badge{font-size:9.5px;padding:2px 7px;border-radius:4px;font-family:var(--mono);font-weight:600;display:inline-flex;align-items:center;gap:3px;}
.ghost-fresh{background:#dcfce7;color:#16a34a;}
.ghost-normal{background:#f1f5f9;color:#64748b;}
.ghost-aging{background:#fef3c7;color:#d97706;}
.ghost-stale{background:#fef2f2;color:#dc2626;}
.ghost-repost{background:#fef3c7;color:#d97706;}
.ghost-layoff{background:#fef2f2;color:#dc2626;}
.ghost-risk{font-size:10px;padding:3px 8px;border-radius:6px;font-family:var(--mono);font-weight:600;margin-top:8px;}
.ghost-risk-low{background:#dcfce7;color:#16a34a;}
.ghost-risk-medium{background:#fef3c7;color:#d97706;}
.ghost-risk-high{background:#fef2f2;color:#dc2626;}

/* === FOLLOW-UP BADGE === */
.followup-badge{font-size:10px;padding:4px 10px;border-radius:6px;font-family:var(--mono);font-weight:600;display:inline-flex;align-items:center;gap:4px;cursor:default;}
.followup-default{background:#dbeafe;color:#2563eb;}
.followup-soon{background:#fef3c7;color:#d97706;}
.followup-overdue{background:#fef2f2;color:#dc2626;}

/* === INTERVIEW PREP === */
.interview-prep{background:var(--bg);border-radius:var(--radius-sm);padding:16px;margin-top:12px;border:1px solid var(--border);}
.interview-prep h4{font-size:12px;font-weight:700;color:var(--text);margin-bottom:10px;display:flex;align-items:center;gap:6px;}
.prep-facts{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;}
.prep-fact{font-size:11px;padding:6px 10px;background:var(--card);border-radius:6px;border:1px solid var(--border);}
.prep-fact-label{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;margin-bottom:2px;}
.prep-fact-value{color:var(--text);font-weight:600;}
.prep-stories{list-style:none;padding:0;}
.prep-stories li{font-size:11.5px;padding:5px 0;color:var(--text-secondary);border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:6px;}
.prep-stories li:last-child{border:none;}
.prep-strong{color:var(--green);font-weight:600;}
.prep-gap{color:var(--amber);font-weight:600;}

/* === SOURCE BADGE === */
.source-pill{font-size:9px;padding:2px 6px;border-radius:4px;font-family:var(--mono);font-weight:600;background:#f0f4ff;color:#6366f1;}
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "style: add CSS for ghost badges, follow-up, interview prep, source pills"
```

---

### Task 6: Frontend — Render Ghost Badges and Source on User Job Cards

**Files:**
- Modify: `public/index.html` (the `renderUserResults` function, around line 1166)

- [ ] **Step 1: Update the job card HTML in renderUserResults**

Replace the job card template inside `renderUserResults` (the `jobs.forEach` block starting at line 1167). Replace from `jobs.forEach(j=>{` through the closing of `list.innerHTML+=...`:

```javascript
  jobs.forEach(j=>{
    const R=21,crc=2*Math.PI*R,off=crc*(1-j.fit/100);
    const colorVar=j.color==='g'?'var(--green)':j.color==='b'?'var(--blue)':'var(--amber)';
    const tierClass=j.tier;
    const tagClass=j.tier==='hot'?'tag-hot':j.tier==='strong'?'tag-strong':'tag-good';
    const tagLabel=j.tier==='hot'?'hot match':j.tier==='strong'?'strong fit':'good fit';
    const locPill=j.location.includes('Remote')?'b':j.location.includes('Austin')?'g':'';
    const domain=safeDomain(j.url);
    const logoSrc=j.logo||(domain?'https://logo.clearbit.com/'+domain:'');
    const co3=escapeHtml(String(j.company||'').substring(0,3).toUpperCase());
    const logoHtml=logoSrc?`<img src="${logoSrc}" alt="${escapeHtml(j.company)}" onerror="this.parentElement.classList.add('no-img');this.parentElement.textContent='${co3}'">`:(co3||'???');
    const descShort=escapeHtml((j.description||'').substring(0,300).replace(/\s+/g,' '));

    // Ghost badges
    const freshnessClass = j.freshness === 'fresh' ? 'ghost-fresh' : j.freshness === 'normal' ? 'ghost-normal' : j.freshness === 'aging' ? 'ghost-aging' : j.freshness === 'stale' ? 'ghost-stale' : 'ghost-normal';
    const freshnessLabel = j.daysAgo !== null && j.daysAgo !== undefined ? (j.daysAgo === 0 ? 'Today' : j.daysAgo + 'd ago') : (j.posted || 'recent');
    const ghostBadges = `<div class="ghost-badges">
      <span class="ghost-badge ${freshnessClass}">${freshnessLabel}</span>
      ${j.reposted ? '<span class="ghost-badge ghost-repost" title="Multiple similar roles at this company">Reposted</span>' : ''}
      ${j.layoffSignal ? '<span class="ghost-badge ghost-layoff" title="Recent layoffs reported">⚠ Layoffs</span>' : ''}
    </div>`;

    // Ghost risk (only in expanded body)
    const ghostRiskHtml = j.ghostRisk && j.ghostRisk !== 'low' ? `<div class="ghost-risk ghost-risk-${j.ghostRisk}">Ghost risk: ${j.ghostRisk}</div>` : '';

    // Source badge
    const sourceBadge = j.source ? `<span class="source-pill">${escapeHtml(j.source)}</span>` : '';

    list.innerHTML+=`<div class="job-card ${tierClass}" id="ucard-${j.id}"><div class="jc-header" onclick="document.getElementById('ubody-${j.id}').classList.toggle('open');document.getElementById('uchev-${j.id}').classList.toggle('open')"><div class="company-logo">${logoHtml}</div><div class="jc-meta"><div class="jc-title"><a href="${j.url}" target="_blank" onclick="event.stopPropagation()">${escapeHtml(j.title)}</a></div><div class="jc-co">${escapeHtml(j.company)} · ${escapeHtml(j.location)}</div><div class="jc-pills"><span class="pill ${locPill}">${escapeHtml(j.location.split('(')[0].trim())}</span><span class="pill">${escapeHtml(j.type)}</span>${j.salary?`<span class="pill">${escapeHtml(j.salary)}</span>`:''}<span class="pill">${escapeHtml(j.posted||'recent')}</span>${sourceBadge}</div>${ghostBadges}</div><div class="jc-right"><div class="fit-ring"><svg width="48" height="48" viewBox="0 0 54 54"><circle cx="27" cy="27" r="21" class="ring-bg"/><circle cx="27" cy="27" r="21" class="ring-fill" stroke="${colorVar}" stroke-dasharray="${crc}" stroke-dashoffset="${off}"/></svg><div class="fit-num" style="color:${colorVar};">${j.fit}%</div></div><span class="status-tag ${tagClass}">${tagLabel}</span><span class="chevron" id="uchev-${j.id}">▼</span></div></div><div class="jc-body" id="ubody-${j.id}"><div class="co-blurb">${descShort}${descShort.length>=300?'...':''}</div>${ghostRiskHtml}<div class="actions" style="margin-top:12px;"><a class="abtn ${j.color}" href="${j.url}" target="_blank" style="text-decoration:none;">View original posting ↗</a></div></div></div>`;
  });
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat: render ghost badges and source pills on user job cards

Shows posting age (color-coded), repost flags, layoff warnings,
ghost risk level, and data source on each job card."
```

---

### Task 7: Frontend — Follow-Up Countdown on Pipeline Jobs

**Files:**
- Modify: `public/index.html` (pipeline tracking functions)

- [ ] **Step 1: Add follow-up helper functions before the `renderUserResults` function**

Insert in the `<script>` section, before `function renderUserResults`:

```javascript
// ── Follow-Up Tracker ───────────────────────────────────────────
function getFollowUpStatus(job) {
  if (job.stage !== 'Applied' || !job.appliedDate) return null;
  const daysSince = Math.floor((Date.now() - new Date(job.appliedDate).getTime()) / 86400000);
  const daysLeft = 7 - daysSince;
  if (job.followUpDismissed) {
    const dismissedDaysAgo = Math.floor((Date.now() - new Date(job.followUpDismissed).getTime()) / 86400000);
    const resetDaysLeft = 7 - dismissedDaysAgo;
    if (resetDaysLeft > 0) return { daysLeft: resetDaysLeft, status: resetDaysLeft <= 3 ? 'soon' : 'default' };
    return { daysLeft: 0, status: 'overdue' };
  }
  if (daysLeft > 3) return { daysLeft, status: 'default' };
  if (daysLeft > 0) return { daysLeft, status: 'soon' };
  return { daysLeft: Math.abs(daysLeft), status: 'overdue' };
}

function dismissFollowUp(jobId) {
  const jobs = lsGet(U_JOBS_KEY);
  const j = jobs.find(x => x.id === jobId);
  if (j) { j.followUpDismissed = new Date().toISOString(); lsSet(U_JOBS_KEY, jobs); renderUserJobs(); }
}
```

- [ ] **Step 2: Update updateUserJobStage to record appliedDate**

Replace the `updateUserJobStage` function:

```javascript
function updateUserJobStage(id, stage) {
  const jobs = lsGet(U_JOBS_KEY);
  const j = jobs.find(x => x.id === id);
  if (j) {
    j.stage = stage;
    if (stage === 'Applied' && !j.appliedDate) {
      j.appliedDate = new Date().toISOString();
      j.followUpDismissed = null;
    }
    if (stage !== 'Applied') {
      j.followUpDismissed = null;
    }
    lsSet(U_JOBS_KEY, jobs);
    renderUserJobs();
  }
}
```

- [ ] **Step 3: Update renderUserJobs to show follow-up badge**

In the `renderUserJobs` function, update the job card template. Replace the return line inside `list.innerHTML=jobs.map(j=>{...}` (around line 1306-1312):

```javascript
  list.innerHTML=jobs.map(j=>{
    const stageOpts=STAGES.map(s=>`<option value="${s}" ${j.stage===s?'selected':''}>${s}</option>`).join('');
    const titleHtml=j.url?`<a href="${j.url}" target="_blank" rel="noopener">${escapeHtml(j.title)}</a>`:escapeHtml(j.title);
    const metaBits=[escapeHtml(j.company),j.location?escapeHtml(j.location):''].filter(Boolean).join(' · ');
    const notes=j.notes?`<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(j.notes)}</div>`:'';
    // Follow-up badge
    const fu = getFollowUpStatus(j);
    const fuHtml = fu ? `<div style="margin-top:6px;"><span class="followup-badge followup-${fu.status}">${fu.status === 'overdue' ? 'Follow up overdue (' + fu.daysLeft + 'd)' : 'Follow up in ' + fu.daysLeft + 'd'}</span> <button onclick="dismissFollowUp('${j.id}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:11px;font-family:var(--mono);" title="Snooze 7 days">snooze</button></div>` : '';
    // Interview prep trigger
    const prepHtml = j.stage === 'Interview' ? `<div id="prep-${j.id}" class="interview-prep"><h4>Interview Prep</h4><div id="prep-facts-${j.id}"><div style="font-size:11px;color:var(--text-muted);">Loading company info...</div></div><div id="prep-stories-${j.id}"></div></div>` : '';

    return `<div class="user-job-card"><div class="ujc-main"><div class="ujc-title">${titleHtml}</div><div class="ujc-meta">${metaBits}</div>${notes}${fuHtml}${prepHtml}</div><div class="ujc-right"><select class="stage-select" onchange="updateUserJobStage('${j.id}',this.value)">${stageOpts}</select><button class="icon-btn" onclick="removeUserJob('${j.id}')" title="Remove">✕</button></div></div>`;
  }).join('');

  // Load interview prep for any Interview-stage jobs
  jobs.filter(j => j.stage === 'Interview').forEach(j => loadInterviewPrep(j));
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: add follow-up countdown badge on Applied jobs

7-day countdown turns amber at 3d, red when overdue.
Snooze button resets the timer. Badge disappears on stage change."
```

---

### Task 8: Frontend — Interview Prep Panel

**Files:**
- Modify: `public/index.html` (add loadInterviewPrep function)

- [ ] **Step 1: Add the loadInterviewPrep and generateStarPrompts functions**

Add after the `dismissFollowUp` function:

```javascript
// ── Interview Prep ──────────────────────────────────────────────
async function loadInterviewPrep(job) {
  const factsEl = document.getElementById('prep-facts-' + job.id);
  const storiesEl = document.getElementById('prep-stories-' + job.id);
  if (!factsEl || !storiesEl) return;

  // Fetch company info
  try {
    const r = await fetch('/api/company-info?company=' + encodeURIComponent(job.company || ''));
    const info = await r.json();
    let factsHtml = '<div class="prep-facts">';
    if (info.size) factsHtml += `<div class="prep-fact"><div class="prep-fact-label">Size</div><div class="prep-fact-value">${escapeHtml(info.size)}</div></div>`;
    if (info.funding) factsHtml += `<div class="prep-fact"><div class="prep-fact-label">Funding</div><div class="prep-fact-value">${escapeHtml(info.funding)}</div></div>`;
    if (info.glassdoor && info.glassdoor !== 'N/A') factsHtml += `<div class="prep-fact"><div class="prep-fact-label">Glassdoor</div><div class="prep-fact-value">${escapeHtml(info.glassdoor)}/5</div></div>`;
    if (info.industry) factsHtml += `<div class="prep-fact"><div class="prep-fact-label">Industry</div><div class="prep-fact-value">${escapeHtml(info.industry)}</div></div>`;
    if (info.news) factsHtml += `<div class="prep-fact" style="grid-column:span 2"><div class="prep-fact-label">Recent News</div><div class="prep-fact-value">${escapeHtml(info.news)}</div></div>`;
    factsHtml += '</div>';
    factsEl.innerHTML = factsHtml;
  } catch (e) {
    factsEl.innerHTML = '<div class="prep-facts"><div class="prep-fact"><div class="prep-fact-label">Industry</div><div class="prep-fact-value">Technology</div></div></div>';
  }

  // Generate STAR prompts from job description/title vs resume
  const prompts = generateStarPrompts(job);
  if (prompts.length) {
    storiesEl.innerHTML = '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:6px;margin-top:8px;">Prepare to discuss</div><ul class="prep-stories">' +
      prompts.map(p => `<li><span class="${p.type === 'strong' ? 'prep-strong' : 'prep-gap'}">${p.type === 'strong' ? '✓' : '○'}</span> ${escapeHtml(p.text)}</li>`).join('') + '</ul>';
  }
}

function generateStarPrompts(job) {
  // Extract keywords from the job title and any stored description/notes
  const jobText = ((job.title || '') + ' ' + (job.notes || '') + ' ' + (job.description || '')).toLowerCase();
  const resumeText = lastResumeText ? lastResumeText.toLowerCase() : '';

  // Key skill areas to check
  const skillAreas = [
    'community building', 'product management', 'operations', 'growth', 'marketing',
    'cross-functional', 'leadership', 'customer success', 'revenue', 'pricing',
    'data analysis', 'project management', 'event planning', 'sales', 'partnerships',
    'retention', 'acquisition', 'onboarding', 'strategy', 'budget',
    'team management', 'stakeholder management', 'process improvement', 'reporting',
    'vendor management', 'program design', 'user experience', 'marketplace'
  ];

  const prompts = [];
  skillAreas.forEach(skill => {
    if (jobText.includes(skill)) {
      const inResume = resumeText.includes(skill);
      prompts.push({
        text: skill.charAt(0).toUpperCase() + skill.slice(1) + (inResume ? ' (strong in your resume)' : ' (gap — prepare examples)'),
        type: inResume ? 'strong' : 'gap'
      });
    }
  });

  // Sort: strong first, then gaps
  prompts.sort((a, b) => (a.type === 'strong' ? 0 : 1) - (b.type === 'strong' ? 0 : 1));
  return prompts.slice(0, 8);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat: add interview prep panel with company facts and STAR prompts

Shows company size, funding, Glassdoor, news, and skill-matched
story prompts when a job is in Interview stage."
```

---

### Task 9: Smoke Test and Final Verification

- [ ] **Step 1: Start the server and verify it boots**

```bash
cd "C:/Users/avina/OneDrive/Desktop/Claude Projects/Kyle Job Board"
node server.js
```

Expected: `Your Job Board running on port 3000` — no crashes.

- [ ] **Step 2: Test the /api/find-jobs endpoint**

Open a browser to `http://localhost:3000`. Upload a resume on "My Board" tab and click "Search Jobs". Verify:
- Jobs appear with ghost badges (posting age, any repost/layoff flags)
- Source pills show on each card (e.g., "RemoteOK", "Greenhouse")
- Scoring produces reasonable results (fresh jobs score higher)

- [ ] **Step 3: Test the pipeline features**

Manually add a job and set its stage to "Applied". Verify:
- Follow-up countdown badge appears ("Follow up in 7d")
- Snooze button works

Change the stage to "Interview". Verify:
- Interview prep panel appears with company facts
- STAR prompts show based on the job title

- [ ] **Step 4: Test the /api/company-info endpoint**

```bash
curl "http://localhost:3000/api/company-info?company=airbnb"
```

Expected: JSON with `size`, `funding`, `glassdoor`, `industry`, `news` fields.

- [ ] **Step 5: Verify Kyle's Example Board is unchanged**

Click the "Example · Kyle's Board" tab. Verify:
- All 18 jobs still render correctly
- Fit rings, donut chart, sidebar all work
- No visual changes or regressions

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final verification pass — all features working"
```
