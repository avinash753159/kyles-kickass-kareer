# Devin handoff — 2026-04-19

## What shipped on this branch

**Branch:** `devin/1776563701-golden-path-and-residual`
**Base:** `master` @ `544cff3`
**New commits (23):** see `git log 544cff3..HEAD --oneline`
**Repo:** https://github.com/avinash753159/your-job-board

Two big changes landed, plus polish:

### 1. Scoring rewrite — keyword → LLM (career-fit)
`lib/llm-scorer.js` + `server.js` `/api/find-jobs`:
- **Was:** keyword overlap via `scoreFit()` in `server.js`. A resume that mentioned "product" → every generic "Product Manager" job scored 75%. Kyle, a coliving community operator, was matched to "Lyft Group PM, Pricing" at 75% fit. The user's primary complaint this session.
- **Now:** keyword filter narrows 500+ jobs → 60 candidates; Claude Opus 4.7 with adaptive thinking scores those 60 by career trajectory against a detailed rubric (0-100 bands, weighted signals). Returns a `fit` score + `fitReason` one-liner citing the candidate's actual prior experience.
- **Location is a soft signal** (post-scoring boost), not a hard filter. Austin jobs get +12, remote jobs get +4 when "Austin" is selected. Previously, picking Austin collapsed the candidate pool from ~1080 jobs → 3 before scoring. Now it preserves the pool and shapes the ranking.
- **Graceful fallback:** if `ANTHROPIC_API_KEY` is missing or the Anthropic call throws, the handler logs it and falls back to keyword scores (threshold 40 instead of 55).
- **Cost:** ~$0.12-0.18/search (Opus 4.7 + thinking + ~3-6K output tokens). 5× the previous Haiku version, but the user explicitly chose this tradeoff for match quality.
- **Latency:** ~20-40s for the LLM call, ~30-50s total search. Streaming internally via `stream.finalMessage()` to avoid SDK HTTP timeouts.

Reference: `docs/LLM_SCORING.md`.

### 2. Impeccable UI redesign (11 passes, 0 scanner findings)
`public/index.html`:
- Fonts: Inter + IBM Plex Mono → **Geist + Geist Mono + Bricolage Grotesque** (display).
- Removed all 7 `border-left: 3px solid color` side-tabs (the #1 AI slop tell per impeccable).
- Flattened 3 gradients (brand / stat card / button), removed colored glows (live dot / primary btn hover).
- Dashboard: 4-card hero-metric grid → **single slim summary strip** (52px display number + mono breakdown chip).
- Sidebar: donut + Top-5 removed; results view is now single-column 820px with Sources-of-Me pulled inline as `<details>` disclosure.
- Top hot match gets a visible `hot-hero` treatment (larger padding, 19px display title, "Top match for your resume" eyebrow).
- `fitReason` block is the card's primary content (display-adjacent font, 14.5px, real padding) rather than a thin chip.
- Narrow-result nudge: picking Austin/Remote with <5 results now shows an amber banner + one-click widen to Anywhere.
- Upload copy: "Welcome to Your Job Board" → **"Jobs that actually fit your resume."** with a subhead that names the differentiator.
- Loading copy: "Scanning job boards..." → "Scoring jobs by career fit" + mono substrate.
- Wordmark brand (dot + "Your Job Board"), no more square app icon.
- Left-aligned hero with clamp() fluid h1 (28-38px), 22ch max-width headline.
- Staggered card entrance animation (60-260ms delays, prefers-reduced-motion respected).
- Mobile responsive pass under 500px.

---

## What to test (first-time pass, ~15 min)

**Setup:**
```bash
git fetch origin
git checkout devin/1776563701-golden-path-and-residual
npm install
# Set ANTHROPIC_API_KEY in .env.local (gitignored). Request a key from Avinash if needed.
# Example:
cat > .env.local <<'EOF'
HUNTER_API_KEY=7b5adce8f66f24b8af6f4439f1fde92de4b5b0dc
ANTHROPIC_API_KEY=sk-ant-api03-...your-key-here...
PORT=3000
EOF
node --env-file=.env.local server.js
```

Open http://localhost:3000.

### T1 — Golden path with Kyle's resume

1. Upload `KyleGaarder_Resume_0426 (1).pdf` (in repo root).
2. Confirm the resume chip appears with a green dot indicator and the filename in mono.
3. Select **Anywhere**.
4. Click **Search jobs**. Wait 25-45s (Opus + 60-job batch is the slow path).
5. **Expected:**
   - Between 5-15 matches returned, all scored by `llm` (check DevTools → Network → `/api/find-jobs` response → `scoredBy: "llm"` on every job).
   - Top match should be a coliving/community/hospitality role at a peer company (Kindred, Commune, Industrious, Sonder, Kindred Staff PM, Notion Community Programs, Duolingo Community Manager).
   - The top card should have a visible `Top match for your resume` eyebrow and slightly richer chrome.
   - Every card has a `Why this fits` block in green with a one-line reason citing specific line items from Kyle's resume (Commune, 48 events, 94% occupancy, Revillage, Van Village).
   - **No Lyft Pricing PM, no Stripe PMM, no Amazon Healthcare in the top 5.** If any generic-PM role appears in the top 5, that's a regression from last session — report it.
6. Click a card to expand. Confirm:
   - Description (`co-blurb`) reads as plain text, not a tinted-box-within-card.
   - If `ghostRisk` is non-low, a colored pill + explanation shows.
   - Hunter contacts load async ("Looking for hiring-side contacts at [domain]...")
   - Footer button says "View original posting →" and is neutral dark (not tier-colored).

### T2 — Location soft signal

1. With Kyle's resume still loaded, click **Austin, TX** in the top bar.
2. Click **Search again**.
3. **Expected:**
   - ≥10 matches returned (previously this collapsed to 3; the architectural fix is the big change).
   - Each returned job has a `locationBoost` field in the response: Austin-listed jobs = 12, remote = 4, others = 0.
   - `fit = rawFit + locationBoost` (clamped to 100).
   - Austin-listed and remote jobs surface higher than before while non-Austin-non-remote roles still appear if they're a strong career fit.
4. Switch to **Remote**, click Search again.
   - Remote jobs get +10 boost; non-remote get 0.
5. Switch back to **Anywhere**.
   - No boosts, pure LLM ranking.

### T3 — Non-Kyle resume (the Sonia case)

This is the one that broke last session.

1. Upload a different person's resume — a consultant, operations director, or whatever you have handy. (The owner tested with `Sonia Sharma Resume.pdf` which gave 1 bad match.)
2. Select **Austin, TX**.
3. Click **Search jobs**.
4. **Expected:**
   - Multiple matches, not 1. The old bug was: location filter ran BEFORE scoring and collapsed 1080 jobs to 3 for a non-Austin person. Now location is soft-signal post-scoring.
   - Top matches should make sense for this person's actual career trajectory, not keyword overlap with "Austin."
   - If the person is LA-based or consulting-heavy, expect results that respect BOTH their trajectory and a preference for Austin/remote roles.
   - If <5 matches return, the amber **"Only N Austin matches. Your resume is a strong fit for more roles elsewhere. See Anywhere →"** banner should appear at the top of the list with a one-click widen.

### T4 — Scoring honesty sanity check

The old Haiku scorer was charitable. The new Opus scorer is brutally honest. Quick sanity:

1. With any resume, inspect the `/api/find-jobs` response (DevTools → Network).
2. For each job, look at `rawFit` (the LLM's raw score) and `fitReason`.
3. **Expected patterns:**
   - `rawFit` distribution is wider than Haiku's. Low fits should be genuinely low (single digits), high fits rare. Most jobs should land 40-70.
   - `fitReason` cites specific items from the resume — company names, numbers, outcomes — not generic phrases like "strong leadership skills."
   - For a resume with no engineering background, "VP Engineering" / "Staff SWE" roles should score 0-10, not 30-50.
   - For a resume with no pricing/marketplace background, "Pricing PM" roles should score 0-15.
   - A resume with strong trajectory toward the job should score 80+; many jobs in a 60-batch won't clear 55%, and that's CORRECT behavior.

### T5 — Fallback path (keyword-only scoring)

1. Stop the server. Remove `ANTHROPIC_API_KEY` from env (or set to empty string).
2. Restart: `HUNTER_API_KEY=... PORT=3000 node server.js`.
3. Server log on first search should emit: `ANTHROPIC_API_KEY missing — falling back to keyword scoring`.
4. Search returns jobs, each has `scoredBy: "keyword"` and `fitReason: null`.
5. UI falls back to the old keyword-chip display in place of "Why this fits."
6. Threshold for showing is 40% instead of 55% (keyword scores are calibrated differently; lower threshold keeps the results populated).

### T6 — Empty state

1. Upload a resume, pick a very niche location+role combination that produces 0 matches.
2. Should fall back to the upload screen with the message: *"No matches passed the 55% career-fit threshold for [location]. Try Anywhere, or add extra context (LinkedIn URL, what you want) below — that usually opens the search."*

### T7 — UI smoke

- `Ctrl+Shift+R` hard-refresh ensures the new static CSS loads.
- Visual check:
  - Brand mark: green bullet + "Your Job Board" wordmark, no square icon.
  - Header: no "N visitors" chip (removed per user request; the `/api/visit` ping still fires silently).
  - Tab labels: "Your search" / "Curated example · Kyle's board".
  - Hero: **left-aligned** (not centered) with a clamp()-fluid display headline up to 38px. Subhead italicizes "career fit" and "why it fits you."
  - Fonts: Geist for body, Geist Mono for numerics/labels, Bricolage Grotesque on headings and the Search button. **No Inter.** Confirm with DevTools Inspector.
  - No `border-left: 3px solid var(--color)` on any card. Tier is carried by fit-ring color + (for hot-hero) tinted card background.
  - No gradient backgrounds anywhere in the primary flow (brand icon, stat cards, buttons).
  - Results view single-column, max 820px wide.
  - "Add more context" opens as a native `<details>` disclosure at the bottom of results.

### T8 — Mobile / narrow viewport

Resize browser to <500px width.
- `results-summary` number shrinks to 40px.
- `last-run-bar` wraps, `Search again` button no longer jammed at margin-left:auto.
- Job cards tighten (`jc-header` padding 14px, company-logo 36px, fit-ring 42px).
- Upload hero h1 drops to 26px, padding 24px.

---

## What to fix (known issues, in priority order)

### P1 — `test/scoring.test.js` fixture missing
Pre-existing from an earlier PR. `test/scoring.test.js` requires `test/fixtures/avinash-ee-phd.txt`, which was never committed. Running `npm test` produces 1 failure of 21 tests.

**Fix:** either commit a plausible EE/PhD resume fixture OR skip the failing test OR delete the block that references the missing fixture. Not in the scope of this branch's changes but blocks any CI wiring.

### P2 — Dead CSS sweep
Several CSS rules are no longer referenced by any markup after the UI passes:
- `.ghost-badges`, `.ghost-badge`, `.ghost-fresh/normal/aging/stale/repost/layoff` — ALREADY deleted this pass.
- `.toggleSources` JS function — still defined, now a no-op (null-guarded). Can be deleted.
- `.fit-bar-bg` / `.fit-bar-fill` — removed.
- Other sidebar-only classes (`.side-card`, `.donut-wrap`, `.donut-legend`, etc.) are still referenced by Kyle's example board, so leave them.

**Fix:** grep-and-prune pass. No urgency — bytes only, not correctness.

### P3 — Kyle's example board still uses the old 4-stat-card layout
Intentional for this branch — Kyle's board is a curated demo that shows 24+ tailored resumes with the old dashboard chrome. If you want consistency across both boards, port the summary-strip + card changes over.

**Fix:** ask Avinash whether Kyle's board should be modernized. If yes, mirror the changes from `#view-user-results` onto `#view-example`.

### P4 — Opus 4.7 latency
30-50s total search time is on the edge of user patience. Options:
- Drop to Sonnet 4.6 for a 2-3x speedup with some quality loss.
- Parallelize: split the 60 candidates into two 30-job batches, score in parallel, merge.
- Cache the system prompt across 5-min windows (we already do via `cache_control: ephemeral`, but a 1h TTL via `cache_control: {type: "ephemeral", ttl: "1h"}` would extend coverage).

**Fix:** gather real user latency data before optimizing. Quality is the user's stated priority; if feedback is "too slow," then tune.

### P5 — Fewer matches per search
Opus is rejecting more borderline fits than Haiku did, which means ~4-8 matches per Kyle search vs ~15 with Haiku. Users may want more options to browse.

**Fix:** consider two modes — "strict" (current, 55% threshold) and "broad" (45% threshold, shows "Weaker match" section). Or just lower the threshold. Needs a UX decision.

### P6 — Empty state shows as upload screen
When 0 matches pass the threshold, the UI reverts to the upload screen with a toast. It should probably show the results shell with a more helpful empty state (e.g., "No strong matches in [location]. Here are the top 3 by keyword match anyway:") rather than disorienting the user back to "upload a resume."

**Fix:** render a small empty-state block inside `#view-user-results` instead of routing back to `#view-user-upload`.

### P7 — Ghost-risk panel styling
The "Likely a ghost listing" / "Possible ghost listing" block uses mono font + tight pill styling. Readable but doesn't match the new display-font card aesthetic.

**Fix:** small cleanup, low priority.

---

## How to make the matching even better (if you want to push quality)

The user's explicit ask is **"BEST matches for the candidate. use an intelligent model if you have to."** Current state is Opus 4.7 + detailed rubric. Further steps:

### Idea 1 — Pre-extraction structured resume parse
Before the scoring call, run a first pass that extracts a STRUCTURED view of the resume: titles held (with dates), industries, company stages, specific outcomes/numbers, tech stack, leadership scope. Cache that parse. Pass the STRUCTURE + original text into the scoring prompt. The LLM has a much easier time if the raw PDF text is pre-organized.

This is the highest-impact quality win and probably +10-15% accuracy on borderline cases.

### Idea 2 — Per-job deep scoring with larger context
Right now all 60 jobs share a single call. Splitting into 60 individual calls would:
- Let Opus spend more thinking per job.
- Reduce cross-contamination (the model may be consciously distributing scores rather than independently evaluating each).
- But: 60x the cost (~$7/search). And 60x the latency unless parallelized.

Alternative: two-pass. First pass batch-scores all 60, identifies top 15. Second pass deep-scores those 15 individually. Catches the "diamond in the rough" cases where a job is actually a 95% fit but got a 75% in the batch because of context dilution.

### Idea 3 — Peer-company lookup
A resume that mentions "Industrious" and "Commune" gives the scorer a handful of known coworking/coliving companies. Augment the prompt with a list of PEER companies for each mentioned company (Kindred, WeWork, Sonder, The Collective, Outsite, Roam, etc.) so the scorer can identify when a JOB is at a peer company and weight accordingly.

Could be done via a static curated dictionary or a secondary LLM call on the company names.

### Idea 4 — Resume-to-job semantic embedding as an additional signal
Use Voyage or another embedding model to compute the resume's embedding and each job's embedding. Compute cosine similarity as a secondary signal. Blend with the LLM score. This catches semantic alignment the LLM might miss due to context dilution.

### Idea 5 — Negative reference learning
Maintain a `docs/rejected_matches.json` list of (resume, job, "this was a bad match") pairs that Kyle or users have flagged. Inject them as few-shot "don't recommend these kinds of jobs" examples in the scoring prompt.

### Idea 6 — Career trajectory inference
Before scoring, have the LLM write a 2-3 sentence summary of the candidate's career arc and the "kind of role that's a Day-1 fit." Pass that distilled description into the scoring pass. This gives the scorer a shared mental model of the candidate rather than re-reading the resume for every job.

**Pick one:** Idea 1 (pre-extraction) or Idea 6 (trajectory inference) are the best ROI for quality. They're both O(1) extra calls per search and materially change how the scorer reasons.

---

## How to verify I didn't break anything

```bash
# Unit tests — should be 3/3 pass (pre-existing scoring.test.js failure is unrelated)
npm test 2>&1 | grep -E "^(ok|not ok|✔|✖|ℹ pass|ℹ fail)" | tail -15

# Impeccable scanner on the frontend — should be []
npx --yes impeccable --json --fast public/index.html

# Live server + curl smoke
node --env-file=.env.local server.js &  # in one terminal
# Wait 3s, then:
curl -s http://localhost:3000/healthz
curl -s -X POST http://localhost:3000/api/find-jobs \
  -H 'Content-Type: application/json' \
  -d '{"resumeText":"Kyle Gaarder - community operator, 48 events at Commune coliving, 94% occupancy. Member experience at Industrious coworking.","location":"anywhere"}' \
  -m 120 | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('jobs:',r.jobs.length,'scoredBy:',[...new Set(r.jobs.map(j=>j.scoredBy))].join(','));r.jobs.slice(0,3).forEach((j,i)=>console.log((i+1)+'. '+j.fit+'% '+j.title+' @ '+j.company))"
```

Expected:
- `npm test` → 20 pass, 1 fail (the pre-existing `scoring.test.js` ENOENT on missing fixture).
- `npx impeccable` → `[]`.
- `curl find-jobs` → returns `jobs:` 5-15, `scoredBy: llm`, top 3 community/coliving roles.

---

## Open questions for Avinash (if anything's unclear)

1. **Model choice** — Opus 4.7 costs ~$0.12-0.18/search. Worth it? Or drop to Sonnet 4.6 at ~$0.05?
2. **Threshold** — 55% is strict; many users will see 4-8 matches per search. Lower to 45% for more volume?
3. **Kyle's example board** — modernize to match the new UI, or keep as the "old-school dashboard" demo?
4. **Pre-extraction quality boost** — worth building Idea 1/6 from above?
