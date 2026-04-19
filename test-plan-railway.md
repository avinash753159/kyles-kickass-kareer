# Railway deploy — end-to-end test plan

Target: https://your-job-board-production.up.railway.app/ (commit `7a86c77`).

## Context

This branch swapped keyword scoring for an LLM scorer (Claude Haiku 4.5 via `lib/llm-scorer.js`) and shipped a redesigned single-column UI with a `fitReason` card block, hot-hero "Top match for your resume" eyebrow, inline Sources-of-Me `<details>`, and a location soft-signal (Austin +12 / remote +4). A review-bot finding flagged the non-English-market allowlist as dropping Palo Alto / Mountain View / Santa Clara / Redmond jobs — killing the EE resume's top matches — so I pushed a fix at `7a86c77` (see `server.js:975-991`, `test/filters.test.js:85-116`).

## What I'll test (one primary flow + one regression spot-check)

### Primary — T1: Kyle's resume, Anywhere, LLM golden path

Steps (recording from this point):
1. Open https://your-job-board-production.up.railway.app/ in a maximized browser.
2. **Email-gate modal** — expect it to appear on first visit. Assertion: modal contains the text **"No thanks, my parents already know I'm a disappointment"** on the skip button (public/index.html:445). Click **skip**.
3. **Upload** `KyleGaarder_Resume_0426 (1).pdf` via the upload input on the **Your Board** tab.
   - Assertion: filename chip renders the file name in a monospace font (no "Kyle" copy unless the PDF itself provides that name).
4. Confirm the location row shows **"Anywhere"** selected (default).
5. Click **Search jobs**. Wait up to 60s.
   - Assertion: loader appears, then results render in `#view-user-results`.
   - Assertion: **at least 8 cards render** (API smoke returned 11).
6. **Top card (hot-hero)**:
   - Assertion: eyebrow text reads literally **"Top match for your resume"** (public/index.html:1448).
   - Assertion: top card's company is a coliving / community / hospitality brand. API smoke returned **Equity Lifestyle Properties — General Manager** at 79%. Pass = top card company ∈ {Equity Lifestyle Properties, Notion (Community Programs), Duolingo (Community Manager), Reddit (Community Manager), Industrious, Commune, Sonder, Hipcamp, Kindred}. Fail = top card is Lyft Pricing PM / Stripe PMM / Amazon Healthcare / any SWE/ML role.
7. **"Why this fits" block** on the top card:
   - Assertion: green-tinted box with mono eyebrow **"WHY THIS FITS"** (public/index.html:1472).
   - Assertion: the block is a **full sentence** (≥60 chars) that cites at least one specific resume item from {Revillage, 48 dinners, 94% occupancy, Van Village, 3140 subscribers, 48% revenue, 212% efficiency}. Fail = generic "Good match based on keywords" / no reason / a list of chips.
   - This is the assertion a keyword-fallback path could not satisfy: `scoredBy='keyword'` responses have `fitReason: null` and render matched-term chips instead (public/index.html code path diverges at line 1471).
8. **Expand the top card** (click header).
   - Assertion: a plain-text description paragraph appears (`co-blurb`, not tinted-box).
   - Assertion: a Hunter-contacts panel renders with initial text **"Looking for hiring-side contacts at <domain>..."** (public/index.html:1016), then populates with 0–3 contact rows.
   - Assertion: footer contains the link text **"View original posting →"** (public/index.html:909 and user-card equivalent).
9. **Spot-check a non-top card** — any one card lower in the list. Same "Why this fits" sentence shape.

### Regression — T3: Avinash EE resume, Anywhere

One-shot, no recording of the full flow, just a screenshot of the top 5.
1. Refresh the page, skip email-gate if it reappears.
2. Upload `test/fixtures/avinash-ee-phd.pdf` (I'll pre-download this onto the desktop).
3. Location **Anywhere**, click **Search jobs**.
   - Assertion: top 10 cards contain at least 5 of: **Tenstorrent, Cerebras Systems, Astera Labs, SambaNova Systems, IonQ, Lightmatter, PsiQuantum**. API smoke returned 7 of these in the top 10.
   - Assertion: **zero** cards in the top 10 are titled Software Engineer / Employee Communications / Product Marketing Manager (the three failure modes the owner called out on 2026-04-18).
   - Assertion: at least one top-5 card has location **"Palo Alto, CA"**, **"Sunnyvale, CA"**, or **"San Jose, CA"** — this is the proof that the allowlist-regression fix landed (pre-fix those locations were silently dropped before the LLM ran).

## What I'm not testing (out of scope for this recording)

- Austin +12 boost (verified via API smoke: Tenstorrent Austin jumps from 85% → 97% when `location=austin`. Not re-recording in UI; would add minutes for a result that's already proven.)
- Keyword fallback path (T5 in handoff). Verified by construction — the server log from the first deploy showed `ANTHROPIC_API_KEY missing — falling back to keyword scoring` before I swapped in the working key.
- Kyle's Example tab (static JOBS[] data, untouched by this branch per handoff).
- Mobile viewport / empty state / "Add more context" disclosure.

## Evidence I will capture

- One continuous recording of the Kyle flow end-to-end with annotations (setup / test_start / assertion).
- One still screenshot of the Avinash EE top 5.
- Network-tab screenshot of `/api/find-jobs` response headers showing status 200 for Kyle (confirms request reached the server, not the stale deploy).

## Pass/fail verdict shape

Each assertion above is binary. I will post a single GitHub PR comment with a concise bullet list (one line per assertion, passed/failed) and the recording + Avinash screenshot as attachments.
