# Kyle Job Board — Devin AI Handoff & Debug Brief

**Date authored:** 2026-04-18
**Authored for:** Devin AI (or any senior engineer receiving cold handoff)
**Git repo:** https://github.com/avinash753159/your-job-board.git
**Historical / legacy remote (do not push to):** https://github.com/avinash753159/kyles-job-board.git
*(Repo was renamed from `your-job-board` on 2026-04-18; GitHub auto-redirects the old URL.)*
**Main branch:** `master`
**Deployed at:** Railway (public URL owned by repo owner)
**Stack:** Node 20 + Express 5 + vanilla JS/HTML (no framework), deployed via Nixpacks on Railway

---

## 0. TL;DR — Read this first

One sentence: **a user uploads their resume, and the app returns a ranked list of jobs that are *specifically* a good fit for that resume.**

If that single promise is broken, everything else in this doc is a distraction. Your first job is to verify the end-to-end golden path (Section 6). If it works, move on to Section 7 to close the residual issues. If it does not, Section 7 tells you every place it has historically failed and where to start looking.

**Success criteria:**
1. Upload a real, varied resume (e.g. a supply-chain ops resume, a product manager resume, a software engineer resume) on the live Railway deploy.
2. Within ~15 seconds, the UI shows ≥ 5 jobs with fit scores.
3. The top 5 jobs must be recognisably in the resume's career field. A supply-chain resume must NOT return "Senior Product Engineer" as the #1 match; a PM resume must NOT return "Warehouse Associate."
4. All the auxiliary features listed in Section 5 work without console errors and without 500 responses.

**Non-goals:** this is a single-user-ish tool. Do not add a login system, database, or multi-tenant infrastructure. If a feature implies multi-tenancy, treat that as a bug in the feature, not a missing implementation.

---

## 1. THE ONE THING THAT MATTERS

The project's raison d'être is resume-driven job discovery. The owner's frustration throughout the development history has been that the app would surface "jobs that obviously don't match." Every time that happened, the scoring logic was patched. This is why the git log is a sequence of `fix: rewrite scoring...`, `fix: dramatically improve job relevance scoring`, `fix: verify ATS slugs...`, etc.

If you find yourself making any change that does not move the needle on "are the top 5 jobs a genuine match for this resume?", stop and ask yourself whether the change is worth it. Polish, refactoring, and feature additions come *after* that single promise is rock solid.

The app also has secondary features (ghost-job detection, follow-up countdowns, interview-prep panels, Hunter.io email lookup, LinkedIn mutual-connection deeplinks, a pipeline tracker). These are nice-to-haves layered on top. If they collide with the core promise, the core promise wins.

---

## 2. WHO KYLE IS (and why scoring must be personal)

Kyle is the person the app was originally built for. Kyle's background is in **coliving / coworking / hospitality / community operations** — he has been a general manager, community manager, and member experience operator at places like Industrious, Kindred, Sonder-adjacent companies, and Austin-based coliving spaces. He also has some vendor-procurement and supply-chain-adjacent exposure through ops roles.

Why this matters: Kyle is neither a software engineer nor a designer nor a finance person. The scoring engine must therefore distinguish between "jobs in Kyle's field" (community, ops, GM, member experience, coliving, hospitality, real-estate-adjacent) and "jobs that sound superficially related but are wrong career." The latter is where the scoring has historically hallucinated high fits.

The "Example" tab in the UI is **Kyle's curated result set with pre-generated tailored resume PDFs** (see `public/resumes/`). It is *not* live-generated. It's a showcase. Do not try to make the Example tab live — it's deliberately static. See Section 7 for a current UX issue caused by this divergence.

The "My Board" tab is where ANY user (including Kyle, testing a new version of his resume) uploads their resume and gets live-searched results. This is the tab that carries the core promise.

**When you test, test the My Board tab with at least three different resume types.** Do not rely on Kyle's resume alone — the scoring regressed historically by being over-tuned to Kyle.

---

## 3. ARCHITECTURE

### 3.1 File layout (repo root)

```
.
├── server.js                   # Monolithic Express server — 850 lines. ALL backend code.
├── public/
│   ├── index.html              # Monolithic frontend — 1488 lines. HTML + CSS + JS inlined.
│   └── resumes/                # 18 pre-generated Kyle-specific tailored PDFs (Example tab only)
├── package.json                # deps: express, cors, express-rate-limit, @anthropic-ai/sdk,
│                               #       node-fetch, nodemailer, pdf-lib, pdfjs-dist
├── package-lock.json
├── nixpacks.toml               # Railway build config (npm install + node server.js). NO chromium.
├── railway.json                # Railway deploy config. healthcheckPath=/healthz
├── .gitignore                  # minimal: node_modules + .env only
├── .railwayignore              # excludes big/local-only files from deploy (session_logs, legacy, etc.)
├── README.md                   # 2-minute deploy notes
├── Inter-*.ttf                 # font files (historically used by the now-removed Puppeteer resume generator)
├── generate_all_resumes.py     # Kyle-specific resume generator, RUNS LOCALLY ONLY (see §7.Historical)
├── edit_resume.py              # one-off helper — not deployed
├── KyleGaarder_Resume_*.pdf    # Kyle's master resumes — local reference files
├── Kyles Resumes/              # more reference PDFs
├── legacy/                     # old UI shells moved out of the hot path on 2026-04-17
│   ├── Kyle-Dashboard.desktop
│   ├── Kyle_Dashboard.html
│   └── analyze_pdf.py
├── code checker/               # independent code-review prompt + latest review output
│   ├── prompt.txt              # the senior-engineer review prompt
│   ├── code_review_2026-04-17.txt  # full review findings (somewhat stale — see §7)
│   └── run-code-check.bat
├── docs/superpowers/
│   ├── specs/                  # design docs, including THIS file
│   └── plans/                  # implementation plans
├── session_logs/               # per-session transcripts (not committed; local reference)
├── output/                     # ephemeral — formerly Puppeteer PDF output; now unused
├── start-dashboard.bat         # Windows local launcher
└── start-dashboard.sh          # Mac/Linux local launcher
```

### 3.2 Runtime architecture

```
┌──────────────────┐   fetch /api/*    ┌────────────────────────┐
│ public/index.html│ ────────────────▶ │  server.js (Express 5) │
│ (vanilla JS)     │ ◀──────────────── │  :3000                 │
└──────────────────┘     JSON          └───────────┬────────────┘
        ▲                                          │
        │ localStorage                             │ outbound HTTP
        │ (user's uploaded resumes, pipeline       │
        │  stages, notes, sources)                 ▼
        │                              ┌───────────────────────────┐
        │                              │ External APIs (parallel)  │
        │                              │  - RemoteOK               │
        │                              │  - Arbeitnow              │
        │                              │  - Jobicy                 │
        │                              │  - Remotive               │
        │                              │  - The Muse (5 categories)│
        │                              │  - Greenhouse (32 slugs)  │
        │                              │  - Ashby (12 slugs)       │
        │                              │  - Lever  (0 slugs today) │
        │                              │  - Hunter.io (email lookup│
        │                              │    + domain search)       │
        │                              └───────────────────────────┘
        │
   (static asset: public/*)
```

### 3.3 State model

- **Server state** is effectively stateless. There is a single in-memory cache `jobCache = { data, ts }` with a 30-minute TTL (server.js near the top of the job-search section). There is no database. There is no session store. There is no user table.
- **`lastRunTime`** is a single in-memory timestamp that resets on every Railway cold start. This is cosmetic only — see §7 [B9].
- **Client state** lives entirely in `localStorage`. Keys in use:
  - `yjb_user_jobs_v1` — pipeline jobs added via the "Add Job" form (stage, notes, etc.)
  - `yjb_user_resumes_v1` — text of the currently active uploaded resume (this is CLEARED on every page load; see `initUserBoard()` — this is intentional, not a bug)
  - `yjb_user_sources_v1` — user's "Sources of Me" extra context (LinkedIn URL, text notes, additional resume PDFs)
  - `yjb_active_tab_v1` — remembered tab (Example vs My Board)
  - `kyle_sources_v1` — LEGACY key for the Example-tab Sources widget. It's read and rendered in the sidebar but not used to drive scoring. Safe to leave; consolidating it is nice-to-have (§7 [A]).

### 3.4 Deployment topology

- **Railway** hosts the app. The build pipeline is Nixpacks (see `nixpacks.toml`): `npm install` → `node server.js`.
- The only required env var is `HUNTER_API_KEY` (a Hunter.io key; owner has one on the free tier, 50 lookups/month, hence the rate limiter).
- `PORT` is read from the environment; Railway supplies it. Defaults to 3000 if unset (local).
- `healthcheckPath: /healthz` is wired in `railway.json` and returns `{ ok: true, uptime }`.
- Previously the project also tried to run Puppeteer (Chromium) and Python from the deploy box. **That code was removed on 2026-04-17** — do not re-introduce Puppeteer without updating `nixpacks.toml` first (see §7 Historical).

---

## 4. KEY CODE TOUR — read in this order

### 4.1 Entry point: `server.js`

The server is one big file, ~850 lines, roughly sectioned:

```
Lines ~1–15   :  Express setup, JSON body limit 10mb, static('public')
Lines ~17–18  :  GET /healthz  — Railway healthcheck
Lines ~20–55  :  POST /api/extract-text — PDF/text extraction (server-side pdfjs-dist)
Lines ~57–66  :  lastRunTime variable + /api/last-run + /api/update-run (cosmetic)
Lines ~68–94  :  Hunter.io routes (/api/find-email, /api/domain-search) with rate limiter
Lines ~96–99  :  jobCache + CACHE_TTL
Lines ~100–148:  ATS_COMPANIES — array of Greenhouse/Ashby/Lever slugs with tags
Lines ~150–185:  RECENT_LAYOFFS + getLayoffMatch() — ghost-job signal
Lines ~187–207:  selectCompaniesForResume() — picks top-15 ATS companies per keywords
Lines ~209–309:  fetchATSJobs() — parallel fetch from selected ATS portals
Lines ~311–419:  POST /api/find-jobs — THE MAIN ENDPOINT
Lines ~421–547:  fetchAllJobs() — parallel fetch from 5 public job APIs, cached 30m
Lines ~549–555:  timeAgo() helper
Lines ~557–578:  STOP_WORDS + GENERIC_RESUME_WORDS
Lines ~580–679:  extractResumeKeywords() — titles, domain terms, specific words, bigrams
Lines ~681–699:  parseDaysAgo() + parseSalaryMid()
Lines ~701–804:  scoreFit() — THE CORE SCORING ALGORITHM
Lines ~806–847:  COMPANY_INFO + /api/company-info — interview-prep lookup
Lines ~849–850:  app.listen()
```

### 4.2 Frontend: `public/index.html`

One file, ~1488 lines, sectioned:

```
Lines ~1–10     :  head + pdfjs CDN (client-side fallback for PDF text extraction)
Lines ~11–400   :  CSS (design tokens, layout, job card styles, pipeline, etc.)
Lines ~400–800  :  HTML body — header, tabs, Example board content, My Board content
Lines ~800–910  :  JS — init(), tab handling, sources-of-me rendering (Example tab)
Lines ~910–960  :  Sources of Me widget (addSourceFile, addSourceLinkedIn, addSourceText)
Lines ~960–1050 :  User Board state, Command-K palette, tab switching
Lines ~1050–1250:  uploadResume() → extractFromFile() → searchJobs() pipeline
Lines ~1250–1400:  render functions (renderUserJobList, renderUserResumes, renderUserSources)
Lines ~1400–1488:  pipeline tracker, ghost badges, follow-up countdown, interview-prep panel
```

### 4.3 The scoring algorithm — what it actually does

This is the single most important chunk of code in the repo. It lives at `server.js:701-804` in `scoreFit(job, keywords)`. Here it is in prose:

**Step 1 — Title relevance (0 / 1 / 2).** Gather "title-relevant" words from the resume (resume titles + high-signal domain skills + top specific words) and count how many appear as substrings in the job title. `≥2 hits → 2`, `1 hit → 1`, else `0`.

**Step 2 — Wrong-field detection.** Compute a set of resume-flavor booleans — `resumeIsTech`, `resumeIsFinance`, `resumeIsDesign`, `resumeIsSales`, `resumeIsContent`, `resumeIsOps`. Then for each career family, if the resume *lacks* that flavor AND the job title matches a family-specific regex (e.g. "software engineer", "account executive", "SEO manager"), the job is wrong-field. A small list of always-wrong roles (nurse, pharmacist, data center technician, civil engineer, etc.) applies regardless.

**Step 3 — Content score (0–59).** Look inside the job title + description + tags + category for:
- High-signal domain skills from the resume (non-low-signal terms): up to 30 pts, 6 each.
- Bigrams from the resume (e.g. "community manager", "vendor procurement"): up to 24 pts, 8 each.
- Low-signal domain skills (marketing, sales, operations, etc.): up to 5 pts, 1 each.

**Step 4 — Assembly.**
- If wrong-field → score = min(25, 5 + content * 0.15).
- Else if titleRelevance == 2 → score = 65 + min(33, content * 0.55).
- Else if titleRelevance == 1 → score = 30 + min(48, content * 0.8).
- Else → score = 10 + min(30, content * 0.5).

**Step 5 — Adjustments.** Freshness boost/penalty based on `parseDaysAgo(job.posted)`: +3 if ≤7d, -2 if >14d, -4 if >30d, -6 if >45d. Location: +2 if Austin, +1 if remote (note: there is a SECOND +5 Austin boost applied after the main sort in `/api/find-jobs`, which is intentional per the design but is the source of the double-boost issue in [B7][B8] below).

**Clamp:** `Math.max(5, Math.min(98, Math.round(score)))`.

This algorithm has been rewritten several times. Each rewrite fixed a real complaint ("this supply-chain resume is getting zero hits", "this PM resume is getting ML-engineer roles at score 90") but also broke edge cases. **The absence of a unit-test suite is the single largest quality risk in this project.** See §7 [A3].

### 4.4 Keyword extraction — what it actually does

`extractResumeKeywords(text)` at `server.js:580-679`. Four outputs:

1. **`titles`** — regex-matched job titles from the resume text. Multiple passes: a broad regex for `{modifier} {domain} {role-noun}`, a compound-title regex for `X & Y` patterns, then two fallback regexes if the first two produce zero hits.
2. **`domainSkills`** — whitelist of ~100 domain terms (both tech and non-tech: "coliving", "vendor procurement", "community building", etc.). Word-boundary-matched.
3. **`specificWords`** — top 40 most frequent 4+-char words in the resume, minus STOP_WORDS and GENERIC_RESUME_WORDS.
4. **`specificBigrams`** — top 20 two-word sequences, with the same stop/generic filters.

Returns `{ titles, domainSkills, specificWords, specificBigrams }`.

Known area of brittleness: if the resume is image-only (scanned PDF), `/api/extract-text` returns empty text and all four keyword arrays are nearly empty. There is no user-visible warning for this; the search will silently return whatever low-relevance garbage the public APIs had. See §7 [U1].

### 4.5 The find-jobs pipeline in one picture

```
POST /api/find-jobs  (body: { resumeText, location })
  │
  ├──▶ extractResumeKeywords(resumeText)  → { titles, domainSkills, specificWords, specificBigrams }
  │
  ├──▶ Promise.all(
  │       fetchAllJobs()              → [RemoteOK, Arbeitnow, Jobicy, Remotive, Muse] (cached 30m)
  │       fetchATSJobs(selectedCos)   → [Greenhouse, Ashby, Lever], top-15 companies by tag score
  │    )
  │
  ├──▶ merge + dedupe by (title|company) lowercase
  │
  ├──▶ map each job through scoreFit(job, keywords)
  │
  ├──▶ sort desc by fit
  │
  ├──▶ filter out non-English-market locations (big regex — see §7 [B3])
  │
  ├──▶ if location==='remote' → keep only remote; if 'austin' → keep only Austin;
  │    'anywhere' → no extra filter
  │
  ├──▶ Austin jobs get +5 fit, then re-sort
  │
  ├──▶ filter fit < 40
  │
  ├──▶ take top 40
  │
  ├──▶ assign tier: ≥75 → 'hot', ≥60 → 'strong', else 'good'
  │
  ├──▶ compute ghost-risk signals (freshness, layoffMatch, companyRepostCount ≥2)
  │
  └──▶ return { jobs: top, keywords: [top 10 keywords for UI chip row] }
```

---

## 5. FEATURE INVENTORY — what every feature is supposed to do + current believed status

Tier key:
- ✅ **Working** — observed to function correctly as of 2026-04-17 session, and logic has been verified since.
- 🟡 **Probably working, not re-verified** — present in code, no recent regression evidence, but not tested end-to-end recently.
- 🟥 **Known problem** — listed in §7.
- ⚪ **Cosmetic / discretionary** — fine to leave alone.

### 5.1 Resume upload → extract text
**Intent:** User uploads a PDF/DOCX/TXT resume. The app extracts plain text from it for scoring.
**Flow:** `index.html:extractFromFile()` sends base64 to `POST /api/extract-text`. Server tries `pdfjs-dist` for PDFs (first 5 pages). Falls back client-side to the same pdfjs from CDN if the server returns empty. DOCX is fuzzed through a printable-ASCII filter.
**Status:** 🟡 Works for native-text PDFs (the common case). Image-only PDFs will return empty text with no warning.
**Devin action:** Test with 3+ real resumes. If a resume fails to extract, log `console.log` of the text length in `searchJobs()` and surface a UI error instead of silently proceeding.

### 5.2 Resume → keywords
**Intent:** Pull titles, domain skills, specific words, and bigrams from the resume for scoring.
**Flow:** `extractResumeKeywords()` at `server.js:580`. See §4.4.
**Status:** 🟡 Works for typical narrative resumes. Brittle for unusual formats (heavy tables, skills-list-only resumes, all-caps headers).
**Devin action:** Console-log `keywords` in `/api/find-jobs` for each test resume. Confirm `titles` array is non-empty and `domainSkills` captures the resume's real field.

### 5.3 Public-API job fetch
**Intent:** Pull a pool of current jobs from RemoteOK, Arbeitnow, Jobicy, Remotive, The Muse.
**Flow:** `fetchAllJobs()` at `server.js:421-547`. 10-second per-source timeout. 30-minute in-memory cache.
**Status:** 🟡 Works. Note: Arbeitnow and some Muse results include non-US jobs; the downstream `nonEnglishMarket` filter handles it (imperfectly — see §7 [B3]).
**Devin action:** Hit `/api/find-jobs` once, check the server log — there should be a line `"Fetched N unique jobs from 5 APIs"` with N > 200. If N is low, one or more APIs are failing silently (they `catch` + `console.error` their errors).

### 5.4 ATS portal fetch
**Intent:** Pull jobs directly from company career pages hosted on Greenhouse / Ashby / Lever for companies whose tags match the resume's keywords.
**Flow:** `selectCompaniesForResume()` picks top-15 of `ATS_COMPANIES` (server.js:100-148, ~44 companies) by tag-overlap with resume keywords, then `fetchATSJobs()` runs them in batches of 10 concurrent.
**Status:** 🟡 All slugs were verified working on 2026-04-16. Some portals change URLs occasionally; a silent portal failure will show up as fewer ATS jobs than expected in the log line `"Fetched N relevant ATS jobs from 15 portals"`.
**Known subtlety:** `fetchATSJobs` runs an `isTitleRelevant()` pre-filter that is so broad it's effectively a no-op (§7 [B4]). The real filtering happens in scoring.
**Devin action:** Verify that the selected companies list is sensible for the test resume. A hospitality resume should pull companies like Kindred, Airbnb, Pacaso, Clipboard Health, Industrious (not in ATS list yet), etc. — not Stripe, Vercel, Cloudflare.

### 5.5 Scoring → ranked list of top 40
**Intent:** Rank the merged job pool by `scoreFit()` and return the top 40 with scores ≥ 40.
**Flow:** See §4.5 pipeline diagram.
**Status:** 🟡 This has been the most churned-on feature. After the 2026-04-17 fixes (wrong-field gating on `resumeIsOps`, removal of over-strict full-phrase title match), Kyle-style resumes and supply-chain resumes should both produce sensible top lists. Verify on at least 3 resume types.
**Devin action:** **This is the golden path. Spend most of your verification time here.** See §6.

### 5.6 Stat cards (Hot / Strong / Good)
**Intent:** Summary tiles at top of My Board results: counts of jobs in each tier (Hot ≥75, Strong ≥60, Good ≥40).
**Flow:** Computed client-side from the returned job list.
**Status:** 🟡 Works. Purely cosmetic reflection of the data.

### 5.7 Ghost-job badges
**Intent:** Flag jobs that are likely ghost listings. Three signals:
1. **Freshness**: `posted` > 30 days → 'stale', > 14 days → 'aging', etc. Uses `parseDaysAgo()`.
2. **Layoff match**: company recently had layoffs (hardcoded `RECENT_LAYOFFS` array, 6-month rolling window).
3. **Repost**: same company appears 2+ times in the current result set.
Combining 0/1/2/3 signals → ghostRisk: low/medium/high, rendered as a colored chip on the card.
**Status:** 🟥 Code works, but `RECENT_LAYOFFS` is hardcoded with 2025 dates. As 2026 progresses, signal 2 decays to nothing. See §7 [B10].
**Devin action:** Decide with the owner whether to (a) swap to a live feed (layoffs.fyi has a scrape pattern), (b) refresh the hardcoded list quarterly, or (c) delete the feature. Do not leave the current decay path.

### 5.8 Non-English-market filter
**Intent:** Drop jobs posted primarily for non-US markets.
**Flow:** Regex at `server.js:342` in `/api/find-jobs`.
**Status:** 🟥 Over-broad. The regex matches tokens like `europe`, `emea`, `apac` standalone, which triggers on US-headquartered roles listed as "Remote (US / EMEA)". See §7 [B3].
**Devin action:** Rewrite as an allowlist of US/Canada/remote-friendly regions, not a blocklist of foreign ones. Or: only match the location field, not the title/description. Keep a safety valve — be conservative about dropping.

### 5.9 Location filter buttons (Anywhere / Remote / Austin)
**Intent:** UI filter chips that narrow results post-scoring.
**Flow:** `selectedLocation` in the client, passed in POST body, applied at `server.js:353-360`.
**Status:** ✅ Works.

### 5.10 Sources of Me (Example tab sidebar)
**Intent:** Let Kyle drop extra context (LinkedIn URL, free-text notes, additional resume PDFs) that would enrich his profile for scoring.
**Flow:** `renderSources()` in index.html. Stored under `kyle_sources_v1` localStorage key.
**Status:** ⚪ Cosmetic on the Example tab. The widget stores data locally but does not drive the Example tab's scoring (Example tab is static).
**On My Board** (`yjb_user_sources_v1`): the sources' text content is now concatenated with the uploaded resume text before being sent to `/api/find-jobs` (2026-04-17 fix). This is the *right* behavior and should be verified end-to-end.
**Devin action:** Confirm that adding a "supply chain & logistics" freeform source to a PM resume shifts the top results toward ops/logistics roles.

### 5.11 Pipeline tracker (Saved / Applied / Interview / Offer / Rejected)
**Intent:** Track personal application state per job. Dropdown on each card.
**Flow:** `STAGES` array in index.html, per-job stage persisted to `yjb_user_jobs_v1`.
**Status:** 🟡 Works. Only populates for jobs the user has "added" (there's an add-job form on My Board). Jobs from search results are not auto-added to the pipeline — the user must click a "Save" action to pin them.
**Devin action:** Verify the Save flow actually persists to localStorage and survives a page reload.

### 5.12 Follow-up countdown
**Intent:** Once a job is in the Applied stage, show "Follow up in Nd" countdown, nudging at day 7 and day 14.
**Flow:** Inline JS near the bottom of index.html. Uses `appliedAt` timestamp stored on the pipeline item.
**Status:** 🟡 Code present, but discoverability is poor — the user has to know to change stage to Applied to see the countdown. No onboarding or tooltip.
**Devin action:** Low priority. Add a one-line helper under the stage dropdown: "Tip: moving to Applied starts a 14-day follow-up timer." Don't rebuild the feature.

### 5.13 Interview-prep panel
**Intent:** When a job moves to Interview stage, show company facts + STAR prompts.
**Flow:** Client calls `GET /api/company-info?company=X`. Server has a hardcoded `COMPANY_INFO` map of ~22 companies (server.js:807-831). Falls back to `{ size: 'Unknown', industry: 'Technology' }` for anything not in the map.
**Status:** 🟥 Works for the ~22 mapped companies. Since the live pipeline surfaces hundreds of companies, >95% of interview-prep panels will render defaults and look broken. See §7 [A8].
**Devin action:** Either hide the panel when the lookup returns defaults, OR wire a live enrichment call (Clearbit autocomplete, Wikipedia API, etc.). Hiding is the smaller fix; enrichment is the more honest one.

### 5.14 Hunter.io email lookup
**Intent:** Per job card, a "Find direct email" button that queries Hunter.io for the recruiter's email.
**Flow:** `GET /api/find-email?firstName=X&lastName=Y&domain=Z` and `GET /api/domain-search?domain=Z`. Both protected by `hunterLimiter` (10 req/min/IP).
**Status:** 🟡 Works when `HUNTER_API_KEY` is set. The 2026-04-17 session added rate limiting (was a security fix).
**Devin action:** Verify the env var is set in Railway (`railway variables` CLI or the dashboard). Without it, these endpoints return 500. There is no graceful client-side warning for that state.

### 5.15 LinkedIn mutual-connection deeplink
**Intent:** Per company, a "Find mutual connections" button that opens a LinkedIn search URL pre-filled with the company name.
**Flow:** Client-side only — builds the URL and opens in a new tab.
**Status:** ✅ Works. Limitation: the LinkedIn UI behind those search URLs requires the user to be logged in to LinkedIn — that's outside our control.

### 5.16 Command-K quick-find
**Intent:** Ctrl/Cmd+K opens a search overlay to jump to a job by title/company/location.
**Flow:** `openCmd()` / `filterCmd()` in index.html.
**Status:** ⚪ Works on the Example tab. On My Board the overlay filters against `JOBS` (the Example dataset), not the live My-Board results — bug, but minor. Fix or scope it to the active tab.

### 5.17 Example tab (Kyle's curated board)
**Intent:** Showcase what a "perfected" experience looks like for Kyle, with pre-tailored resume downloads per company.
**Flow:** Static `JOBS[]` array in index.html, 18 pre-generated PDFs under `public/resumes/`.
**Status:** ✅ Works as a static showcase. Intentionally separate from the live pipeline.
**Gotcha:** The divergence between Example (polished, tailored PDFs) and My Board (live, no tailored PDFs) confuses new users. See §7 [A6] — consider renaming the tabs to make the distinction explicit.

### 5.18 Last-run timestamp header
**Intent:** Small "last updated" label in the header.
**Flow:** In-memory `lastRunTime` variable server-side + `GET/POST /api/last-run`.
**Status:** 🟥 Resets on every Railway cold start — shows server boot time, not user's real last search. See §7 [B9]. Trivially fixed by persisting to localStorage or accepting as cosmetic.

### 5.19 Healthcheck
**Intent:** Give Railway a way to know the service is up.
**Flow:** `GET /healthz` → `{ ok: true, uptime: process.uptime() }`.
**Status:** ✅ Works. Added 2026-04-17.

---

## 6. END-TO-END TEST PLAN — the golden path Devin must verify

These are the must-pass tests. Run them **against the live Railway deployment** (not only locally), because several historical bugs were deploy-only (Puppeteer missing Chromium, env var unset, etc.).

### Test 0 — Healthcheck
`curl https://<railway-url>/healthz` → expect `200 OK` and JSON `{ ok: true, uptime: N }`.

### Test 1 — Static load
Open `https://<railway-url>/`. Page loads without console errors. Example tab renders with 18 cards. Sources-of-Me widget is in the sidebar.

### Test 2 — Resume upload (PDF)
On the My Board tab, upload a real PDF resume (use a test resume in a field DIFFERENT from Kyle's — e.g. a software-engineer resume, or a supply-chain-ops resume).

Expect:
- The filename appears as a green chip.
- No red errors in the console.
- "Search jobs" button becomes enabled.

### Test 3 — Extract + search (the golden path)
Click "Search jobs" with location = Anywhere.

Expect (within ~15 seconds):
- A loading state, then a grid of job cards.
- Top 5 cards: titles all recognizably in the test resume's field. **This is the pass/fail bar.**
- No 500s. No blank cards. No "Unknown Unknown" entries.
- Server log (Railway logs tab) shows:
  - `Resume keywords: { titles: [...], domain: [...], words: [...], bigrams: [...] }` — sanity check these
  - `ATS: scanning 15 companies: <list>` — sanity check the list matches the resume's field
  - `Fetched N unique jobs from 5 APIs` (N ≥ ~200)
  - `Fetched M relevant ATS jobs from N portals` (M varies)
  - `Found G general + A ATS jobs` then final response

### Test 4 — Wrong-field regression (MUST PASS)
Upload a pure non-tech resume (hospitality / community / ops). Search.

Expect: zero software-engineer, ML-engineer, account-executive, or SEO-manager roles in the top 10.

If this fails, the wrong-field detection in `scoreFit()` (§4.3 step 2) has regressed. Check that `resumeIsTech` etc. are being correctly inferred from `keywords.domainSkills`, and that the `wrongField` block is being applied before the title-relevance branch.

### Test 5 — Resume swap
Upload resume A, search, then upload resume B, search again.

Expect: the results change meaningfully and the OLD resume's chip is replaced (not accumulated). There was a historical bug where chips accumulated and results stayed stale.

### Test 6 — Sources of Me enrichment
Upload a PM resume. Note the top 5 results. Then add a freeform Source: "Specialized in vendor procurement, supply chain, and 3PL logistics for 8 years." Re-run search.

Expect: the top results shift measurably toward ops/logistics roles (at least some ops/logistics jobs should appear where they did not before).

### Test 7 — Pipeline save
On any result card, click through to add/save it into the pipeline. Change stage to Applied. Reload the page.

Expect: the pipeline item is still there in the Applied column, with `appliedAt` timestamp and a follow-up countdown showing days remaining until day 7 or day 14.

### Test 8 — Interview-prep panel
Move a pipeline job for a mapped company (e.g. Airbnb, Stripe, Kindred, Ramp) to Interview stage.

Expect: a company-info panel appears with real company facts.

Move a pipeline job for an UNmapped company (any random small company from the API results) to Interview.

Expect: currently it shows `{ size: 'Unknown', industry: 'Technology' }` — this is the [A8] issue. Decide with owner whether to fix or hide.

### Test 9 — Hunter.io email lookup
On any job card, click "Find direct email" (requires first name + last name + domain in the card).

Expect: a response within 3 seconds — either a real email (green), a "no match" message, or a clean error if `HUNTER_API_KEY` isn't set.

Spam-click 12 times in under a minute.

Expect: 11th request or so should be rate-limited with JSON `{ error: 'Too many lookup requests...' }`.

### Test 10 — LinkedIn deeplink
Click "Find mutual connections" on any card.

Expect: a new tab opens with LinkedIn search URL pre-filled with the company name.

### Test 11 — Location filters
Toggle Anywhere → Remote → Austin. Re-run search each time.

Expect: the job list narrows appropriately. Remote mode should have ~80%+ remote jobs; Austin should show only Austin-based jobs.

### Test 12 — Ghost badges
On Anywhere results, scroll. Expect: some cards should carry a ghost-risk chip (low/medium/high). Cards from recently-laid-off companies (check `RECENT_LAYOFFS` array) should be tagged.

**Caveat:** as we roll into late 2026, `RECENT_LAYOFFS` dates will age out and this test will produce false negatives. This is the [B10] issue.

---

## 7. KNOWN BROKEN / SUSPECT — residual issues

This section is organized by severity. It is the post-mortem of the 2026-04-17 review (see `code checker/code_review_2026-04-17.txt` for the original). Items labeled **CLOSED** were fixed in the 2026-04-17 session; they are listed here only so Devin sees the history and does not regress them.

### 7.1 HIGH — fix early

**[B3] Non-English-market filter is over-broad.**
Where: `server.js:342` inside `/api/find-jobs`.
Symptom: legitimate US-headquartered remote jobs whose location string mentions "US / Europe" or "Remote (Americas / EMEA)" are dropped.
Fix: rewrite as an allowlist matching `/\b(remote|united states|usa|us|canada|austin|...|anywhere)\b/` OR restrict the regex to the location field only (not title/description). Keep a test fixture of a dozen real job postings with ambiguous locations to avoid regressing on the next pass.

**[A3] No test suite. This is the underlying root cause.**
Where: `package.json` has `"test": "echo \"Error: no test specified\" && exit 1"`.
Symptom: every scoring fix is a blind rewrite. The git log shows 5 consecutive "fix scoring" commits.
Fix: add Vitest or Jest. Target coverage:
- `extractResumeKeywords`: 5 fixture resumes × 5 expected-keyword assertions.
- `scoreFit`: a matrix of ~10 fixture resume × 10 fixture job → expected tier. Include:
  - Kyle-style hospitality resume + hospitality job → Hot
  - Kyle-style hospitality resume + software-engineer job → wrong-field / score < 26
  - Supply-chain ops resume + supply-chain job → Hot (regression for [B1] pre-fix)
  - PM resume + ML-engineer job → wrong-field / score < 26 (regression for old B)
- `parseDaysAgo`: round-trip with `timeAgo()`.
Ship the test suite before shipping the next scoring change. Add a `npm test` script that wires it up. Optional: a GitHub Actions workflow.

### 7.2 MEDIUM — cleanup + UX

**[B4] ATS `isTitleRelevant` is effectively a no-op.**
Where: `server.js:217-225` in `fetchATSJobs`. The `broadRoles` list is so broad it matches ~95% of corporate job titles.
Symptom: no pre-filter happens; scoring carries the whole weight. Not actively harmful, but misleading.
Fix: either (a) delete `isTitleRelevant` entirely and trust scoring, or (b) tighten it to match only tokens present in the resume's `keywords.titles`/`domainSkills`. Option (a) is simpler and has no downside.

**[B6] `parseDaysAgo` is lossy.**
Where: `server.js:681-690`.
Symptom: "1mo ago" → 30 days (loses whether it's actually 30–59 days). "today" / "1d ago" swing by 1 day depending on how the upstream API formatted the date. This matters because ghost-risk buckets at 7/14/30/45 day thresholds.
Fix: carry the raw ISO `postedDate` on each job object through the pipeline, use it for math, and keep `timeAgo()` for display. Touch the 5 fetchers to set `j.postedDate = new Date(...)` alongside `j.posted = timeAgo(...)`.

**[B7][B8] Double Austin boost.**
Where: `server.js:800` (scoreFit: +2) AND `server.js` Austin post-sort block (+5) inside `/api/find-jobs`.
Symptom: Austin jobs get +7 total. The design spec specifies +5. Minor over-rank.
Fix: remove the `+2` in `scoreFit`. Keep the `+5` in the post-sort so the bump is visible only after the main filter.

**[B9] `lastRunTime` resets on Railway cold start.**
Where: `server.js:57`.
Symptom: the "Last updated" header shows server boot time, not user's last search.
Fix: persist in the client's localStorage after each search, render client-side. Or drop the feature.

**[B10] `RECENT_LAYOFFS` is hardcoded 2025 dates.**
Where: `server.js:151-172`.
Symptom: by late 2026, the 6-month window filter (`server.js:177-184`) will return nothing; ghost-risk signal 2 stops firing.
Fix: wire `layoffs.fyi` (they have a scrape-friendly table) with a 24-hour in-memory cache, OR add a quarterly-refresh doc, OR delete the feature.

**[A6] Example vs My Board divergence is confusing.**
Where: Conceptual.
Symptom: Example tab has tailored PDFs, polished company info, perfect scores. My Board (live) has none of that. New users think the live pipeline is broken.
Fix: rename tabs to make the distinction explicit. "Example" → "Kyle's Curated Picks (static)"; "My Board" → "Live Search". Or: add a one-line banner on Example saying "This is a static showcase — use My Board for your own resume."

**[A8] `COMPANY_INFO` map covers ~22 of ~500 companies.**
Where: `server.js:807-831`.
Symptom: 95%+ of interview-prep panels show default/unknown values. Looks broken.
Fix:
- Short path: hide the panel when the lookup returns the default object.
- Long path: wire a cheap enrichment. Clearbit's logo endpoint is already used. Clearbit also exposes a company-autocomplete that returns domain + industry for free tier. Cache aggressively; this is called once per interview-stage move.

### 7.3 LOW — nice to have

**[A2] Monolith files.**
`server.js` = 850 lines. `public/index.html` = 1488 lines.
Split `server.js` into:
```
routes/find-jobs.js, routes/extract.js, routes/hunter.js, routes/company-info.js,
lib/scoring.js, lib/keywords.js, lib/ats.js,
data/companies.js, data/layoffs.js, data/stopwords.js
```
Split `public/index.html` into `public/index.html` (skeleton) + `public/app.js` + `public/app.css`.
This is a half-day refactor; wait until after the test suite lands (so you can refactor safely).

**[A5] Defensive `String()` coercions scattered.**
Where: `server.js:371-381` inside `/api/find-jobs`.
Symptom: symptom of distrust of the data pipeline. The fetchers already return clean strings. The coercions obscure the trust boundary.
Fix: delete them, add one schema check at the `res.json` boundary (e.g. one Zod schema for the jobs payload).

**[A7] Magic numbers in `scoreFit`.**
Where: `server.js:784-791` and nearby.
Numbers: 65, 33, 0.55, 30, 48, 0.8, 10, 30, 0.5, +3, -2, -4, -6, +2, +1.
Fix: extract into named constants at the top of `lib/scoring.js` (once it exists) — `TITLE_STRONG_BASE = 65`, `TITLE_STRONG_CAP = 33`, etc. Back them with the test suite from [A3].

**[S5][S6][S7] Minor security polish.**
- `findMoreEmails` injects Hunter.io response fields into `innerHTML`. Wrap each `${field}` in `escapeHtml()`. See `public/index.html:979`.
- `/api/extract-text` doesn't validate file magic bytes; a weaponized non-PDF could hit pdfjs-dist. Check first 4 bytes match `%PDF` before passing to pdfjs.
- `kylegaarder@gmail.com` appears in the Example tab's static JOBS data. Fine for a showcase, would be a leak in a multi-tenant variant. Do not introduce multi-tenancy without fixing this first.

**[U1] Empty-state UX on tight filter.**
If fit ≥ 40 returns only 0-3 jobs, there's no explanation — the UI just looks sparse. Add a message: "Found N jobs above 40% fit. Show weaker matches?" with a slider to drop the floor.

### 7.4 CLOSED (do not regress) — fixed in the 2026-04-17 session

These items were flagged in the 2026-04-17 review (see `code checker/code_review_2026-04-17.txt`) and fixed the same day. Listed here so Devin does not roll any of them back.

- **[B1] CLOSED** — wrong-field regex no longer flags supply-chain/procurement as always-wrong; now gated on `!resumeIsOps`. See `server.js:742-743` and `:761`.
- **[B2] CLOSED** — the too-strict full-phrase `jobTitle.includes(multi-word)` rule was deleted; token-based title matching is now the sole rule (see `server.js:723-726`).
- **[B5] CLOSED** — the duplicate "ML engineer" wrong-field entry is gone; covered once by the general engineer regex at `:746`.
- **[S2] CLOSED** — Hunter endpoints rate-limited via `express-rate-limit` (10 req/min/IP); see `server.js:9-15` + application to both routes.
- **[S3] CLOSED** — `/api/update-sources` + the Python regeneration exec were deleted (option 6C in the session: Sources-of-Me is now wired client-side into the `resumeText` passed to `/api/find-jobs`).
- **[S4] CLOSED** — `renderSources` and `renderUserSources` now wrap label and id through `escapeHtml()` + `encodeURIComponent`/`decodeURIComponent`. See `public/index.html:919-924`.
- **[G1] CLOSED (as 6C)** — Sources-of-Me drives scoring by concatenating client-stored source text with the resume text pre-search. No server regeneration. One localStorage key per tab scope.
- **[G2] CLOSED (by deletion)** — the dead `/api/tailor-resume` + Puppeteer + SSE code was removed when the Puppeteer path was deleted (option 7A).
- **[G3] CLOSED (by deletion)** — Puppeteer and its Chromium requirement removed from dependencies. `nixpacks.toml` no longer needs Chromium.
- **[A1] CLOSED** — repo root cleaned: `standalone-dashboard.html` deleted, `Kyle_Dashboard.html` + `Kyle-Dashboard.desktop` + `analyze_pdf.py` moved to `legacy/`, `Kyles-Dashboard.zip` + the extracted folder removed, `test_result*.json` removed.
- **[D3] CLOSED** — `/healthz` added; `railway.json` `healthcheckPath` wired.

---

## 8. DEPLOYMENT CONTEXT

### 8.1 Required env vars

| Var | Required? | Purpose | Where set |
|-----|-----------|---------|-----------|
| `HUNTER_API_KEY` | Yes (for email features) | Hunter.io API key, 50 lookups/mo free tier | Railway → Variables |
| `PORT` | Auto-set by Railway | HTTP port to bind | Railway injects |

No other vars. The app does not read `.env` files at runtime; `dotenv` is not even a dep.

### 8.2 Install / run

**Locally:**
```
git clone https://github.com/avinash753159/your-job-board.git
cd your-job-board
npm install
HUNTER_API_KEY=<key> node server.js
# open http://localhost:3000
```

**On Railway:** connect the GitHub repo, set `HUNTER_API_KEY`, and push to `master`. Nixpacks auto-detects Node 20, runs `npm install`, and starts `node server.js`.

### 8.3 What to check if deploys go red

1. Railway build logs — look for `npm install` errors.
2. Railway runtime logs — look for port bind issues or first-request `console.error` messages from the API fetchers (RemoteOK / Arbeitnow / etc. occasionally change their response shapes).
3. `/healthz` — if this returns 200 but the app doesn't work, the issue is inside an endpoint handler, not the process.
4. The jobCache warm-up: the first request after a cold start is slow (~10 sec) because all five public APIs + up to 15 ATS portals are hit simultaneously. Subsequent requests are fast for 30 minutes (the cache TTL).

### 8.4 Platforms to leave alone

- **Puppeteer / Chromium:** was removed on 2026-04-17. Do not re-introduce without a plan: Railway's default image does not include Chromium; you would need to add it to `nixpacks.toml` and pin `PUPPETEER_EXECUTABLE_PATH`.
- **Python:** `generate_all_resumes.py` is a local developer tool only. It generates the static PDFs in `public/resumes/` and is not run in production. Do not wire it into the server.

---

## 9. VERIFICATION CHECKLIST — Devin's deliverable

Devin should produce, at minimum, this checklist filled out. Attach console logs and screenshots. Mark each item pass / fail / n/a with a one-line note.

```
[ ]  Test 0  — healthz returns 200
[ ]  Test 1  — static page loads, no console errors
[ ]  Test 2  — resume upload (PDF) succeeds, chip appears
[ ]  Test 3  — search returns ≥5 ranked jobs in <20 sec (run with 3 different resume types)
[ ]  Test 4  — wrong-field regression: non-tech resume returns zero software-engineer roles in top 10
[ ]  Test 5  — resume swap replaces old chip and results
[ ]  Test 6  — Sources-of-Me enrichment shifts top results measurably
[ ]  Test 7  — pipeline save persists across reload
[ ]  Test 8  — interview-prep panel loads for mapped company; behavior for unmapped company documented
[ ]  Test 9  — Hunter.io email lookup works + rate limit fires after 10 req/min
[ ]  Test 10 — LinkedIn deeplink opens correctly
[ ]  Test 11 — Anywhere / Remote / Austin location filters all behave
[ ]  Test 12 — ghost badges render (note any stale layoff data)

Residual issues Devin closed in this pass:
[ ]  [B3]  non-English filter rewritten as allowlist
[ ]  [B4]  ATS isTitleRelevant deleted or tightened
[ ]  [B6]  parseDaysAgo lossiness (postedDate propagated)
[ ]  [B7][B8] double Austin boost consolidated
[ ]  [B9]  lastRunTime persistence fixed or feature dropped
[ ]  [B10] RECENT_LAYOFFS strategy decided (live source / quarterly / deleted)
[ ]  [A3]  test suite added (minimum scoring + keyword extraction coverage)
[ ]  [A6]  tab rename / banner landed
[ ]  [A8]  interview-prep panel hidden when unmapped (short fix) or enriched (long fix)
[ ]  [S5]  Hunter response fields escaped in findMoreEmails
[ ]  [S6]  extract-text validates magic bytes
[ ]  [U1]  empty-state UX for tight filter

Not in scope for this pass (explicit):
[ ]  [A2]  module split (defer until after test suite)
[ ]  Anything requiring a database / auth / multi-tenancy
[ ]  Re-introducing Puppeteer
[ ]  Changes to the Example tab's static data
```

---

## 10. OUT OF SCOPE — things Devin should NOT do

- **Do not introduce a database.** The project is file + localStorage. If you feel the urge, the cure is a smaller feature, not a larger backend.
- **Do not add authentication or multi-tenancy.** The 2026-04-17 review flagged "multi-tenant framing" as false marketing; the owner accepted removing the framing rather than building it. This is a single-user-ish tool.
- **Do not re-introduce Puppeteer, Chromium, or server-side resume generation.** That code path was actively deleted. If resume tailoring comes back, it must be a client-side PDF rendering library or a prebuilt static PDF flow like Kyle's `public/resumes/`.
- **Do not change the Example tab's static dataset.** It is a showcase. It is pinned to Kyle. Separate concern.
- **Do not restructure the folder layout without the owner's approval.** The docs/superpowers layout is intentional (plan → spec → implementation). Keep this file in `docs/superpowers/specs/`.
- **Do not modify `.gitignore` to commit session logs, `output/`, or the `KyleGaarder_Resume_*` PDFs.** They are deliberately untracked — some contain conversation logs or personal resume PDFs and should not be pushed.
- **Do not push to the old remote `old-repo` (kyles-job-board.git).** It is legacy. Only `origin` (`your-job-board.git`) is live.

---

## 11. APPENDIX — key code snippets (embedded for self-contained reading)

### 11.1 `scoreFit()` — the core scoring function (condensed)

```javascript
// server.js ~701-804
function scoreFit(job, keywords) {
  const jobTitle = (job.title || '').toLowerCase();
  const jobDesc  = (job.description || '').toLowerCase();
  const jobText  = (jobTitle + ' ' + jobDesc + ' ' +
                    (Array.isArray(job.tags) ? job.tags.join(' ') : '') + ' ' +
                    (job.category || '')).toLowerCase();

  // STEP 1: title relevance (0/1/2)
  const LOW_SIGNAL = new Set(['marketing','sales','operations','strategy','analytics',
    'growth','finance','leadership','management','consulting','accounting','education',
    'reporting','training','research','analysis','stakeholder','pipeline',
    'acquisition','onboarding','retention','budget','startup','founder']);
  const titleKeywords = new Set();
  keywords.titles.forEach(t =>
    t.split(/\s+/).filter(w => w.length >= 4).forEach(w => titleKeywords.add(w)));
  keywords.domainSkills.forEach(s => {
    if (!LOW_SIGNAL.has(s))
      s.split(/\s+/).filter(w => w.length >= 4).forEach(w => titleKeywords.add(w));
  });
  keywords.specificWords.slice(0, 10).forEach(w => { if (w.length >= 5) titleKeywords.add(w); });
  const titleHits = [...titleKeywords].filter(w => jobTitle.includes(w));
  const titleRelevance = titleHits.length >= 2 ? 2 : titleHits.length === 1 ? 1 : 0;

  // STEP 2: wrong-field detection (gated on resume flavor)
  let wrongField = false;
  const resumeIsTech    = keywords.domainSkills.some(s => /* ...tech terms... */);
  const resumeIsFinance = keywords.domainSkills.some(s => /* ...finance... */);
  const resumeIsDesign  = keywords.domainSkills.some(s => /* ...design... */);
  const resumeIsSales   = keywords.domainSkills.some(s => /* ...sales... */);
  const resumeIsContent = keywords.domainSkills.some(s => /* ...content... */);
  const resumeIsOps     = keywords.domainSkills.some(s => /* ...ops/supply chain... */);
  // ...family-specific regex checks omitted for brevity...
  // Always-wrong roles (regardless of resume): nurse, pharmacist, physician,
  //   data center, truck driver, civil/mechanical/chemical engineer, etc.

  // STEP 3: content score (0-59)
  let contentScore = 0;
  let highHits = 0;
  keywords.domainSkills.forEach(s => {
    if (!LOW_SIGNAL.has(s) && jobText.includes(s)) highHits++;
  });
  contentScore += Math.min(30, highHits * 6);
  let bgHits = 0;
  keywords.specificBigrams.forEach(bg => { if (jobText.includes(bg)) bgHits++; });
  contentScore += Math.min(24, bgHits * 8);
  let lowHits = 0;
  keywords.domainSkills.forEach(s => { if (LOW_SIGNAL.has(s) && jobText.includes(s)) lowHits++; });
  contentScore += Math.min(5, lowHits);

  // STEP 4: assembly
  let score;
  if (wrongField)              score = Math.min(25, 5 + contentScore * 0.15);
  else if (titleRelevance===2) score = 65 + Math.min(33, contentScore * 0.55);
  else if (titleRelevance===1) score = 30 + Math.min(48, contentScore * 0.8);
  else                         score = 10 + Math.min(30, contentScore * 0.5);

  // STEP 5: freshness + location adjustments
  const days = parseDaysAgo(job.posted);
  if (days !== null && days <= 7)       score += 3;
  else if (days !== null && days > 45)  score -= 6;
  else if (days !== null && days > 30)  score -= 4;
  else if (days !== null && days > 14)  score -= 2;
  const loc = (job.location || '').toLowerCase();
  if (/austin/i.test(loc))                       score += 2;
  else if (/remote/i.test(loc) || job.remote)    score += 1;

  return Math.max(5, Math.min(98, Math.round(score)));
}
```

### 11.2 `/api/find-jobs` — the main endpoint (condensed)

```javascript
// server.js ~311-419
app.post('/api/find-jobs', async (req, res) => {
  try {
    const { resumeText, location } = req.body;
    if (!resumeText) return res.status(400).json({ error: 'No resume text' });

    const keywords = extractResumeKeywords(resumeText);
    const selectedCompanies = selectCompaniesForResume(keywords);

    const [generalJobs, atsJobs] = await Promise.all([
      fetchAllJobs(),                                     // 5 public APIs, 30-min cache
      fetchATSJobs(selectedCompanies, keywords).catch(e => []),  // top-15 ATS portals
    ]);

    // merge + dedupe by (title|company)
    const seen = new Set();
    const allJobs = [...generalJobs, ...atsJobs].filter(j => {
      const key = (j.title + '|' + j.company).toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    let scored = allJobs
      .map(j => ({ ...j, fit: scoreFit(j, keywords) }))
      .sort((a, b) => b.fit - a.fit);

    // non-English-market filter (see §7 [B3] — over-broad)
    const nonEnglishMarket = /* big regex */;
    scored = scored.filter(j => !nonEnglishMarket.test((j.location||'').toLowerCase()) &&
                                !/\b(all genders|m\/w\/d|m\/f\/d)\b/i.test((j.title||'').toLowerCase()));

    // location filter
    if (location === 'remote')       scored = scored.filter(j => /remote/i.test(j.location) || j.remote);
    else if (location === 'austin')  scored = scored.filter(j => /austin/i.test(j.location || ''));

    // floor + top N
    scored = scored.filter(j => j.fit >= 40);
    const top = scored.slice(0, 40);

    // tier + ghost signals
    top.forEach(j => {
      j.tier  = j.fit >= 75 ? 'hot' : j.fit >= 60 ? 'strong' : 'good';
      j.color = j.tier === 'hot' ? 'g' : j.tier === 'strong' ? 'b' : 'y';
      j.daysAgo = parseDaysAgo(j.posted);
      j.freshness = /* fresh/normal/aging/stale */;
      j.layoffSignal = getLayoffMatch(j.company);
    });
    // reposts + final ghostRisk...

    res.json({ jobs: top, keywords: keywords.titles.concat(keywords.domainSkills).slice(0, 10) });
  } catch (e) {
    console.error('Find jobs error:', e);
    res.status(500).json({ error: e.message });
  }
});
```

### 11.3 Client flow — upload → search

```javascript
// public/index.html ~1069-1100
async function extractFromFile(file, dataUrl) {
  try {
    const resp = await fetch('/api/extract-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileData: dataUrl, fileName: file.name })
    });
    const result = await resp.json();
    if (result.text && result.text.trim().length > 50) return result.text.trim();
  } catch (_) {}

  // client-side pdfjs fallback
  if (/\.pdf$/i.test(file.name) && window.pdfjsLib) {
    const b64 = dataUrl.split(',')[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
    let t = '';
    for (let p = 1; p <= Math.min(pdf.numPages, 5); p++) {
      const pg = await pdf.getPage(p);
      const c = await pg.getTextContent();
      t += c.items.map(x => x.str).join(' ') + '\n';
    }
    if (t.trim().length > 50) return t.trim();
  }
  // plain-text and last-ditch fallbacks follow...
}

async function searchJobs() {
  // concatenate resume text + Sources-of-Me text, POST to /api/find-jobs
  const resumeText = /* extracted text */ + '\n' + /* concatenated sources text */;
  const resp = await fetch('/api/find-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText, location: selectedLocation })
  });
  const { jobs, keywords } = await resp.json();
  renderUserJobList(jobs);
  renderKeywordChips(keywords);
}
```

---

## 12. HANDOFF NOTES

- **Git log** is a more honest history than any doc. `git log --oneline -30` tells the story of what's been churned. The 5 most recent commits before this handoff were all scoring rewrites — treat this as the hot area.
- **Session logs** (`session_logs/`) are Claude transcripts from prior debug sessions. They are NOT committed (see `.railwayignore`). If the owner grants access locally, they are the single best artifact for "why is this done this way?"
- **`code checker/code_review_2026-04-17.txt`** is the baseline review this handoff builds on. Read it for color on items marked CLOSED in §7.4.
- **If anything in this doc contradicts the current code**, trust the code. Update the doc. Point-in-time docs rot.

---

*End of handoff. Questions or blocker feedback should go back to the repo owner (GitHub: avinash753159) before merging any non-trivial change.*
