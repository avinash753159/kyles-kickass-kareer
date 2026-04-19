# Testing the Job Board app

Node/Express single-page app. No database. Resume upload → keyword extraction → fetch from 5 public APIs + ~15 ATS portals → `scoreFit()` → top 40 cards.

Single source of truth for intent and test plan: `docs/superpowers/specs/2026-04-18-devin-handoff.md` (Section 6 = tests, Section 7 = issues, Section 9 = checklist, Section 10 = out-of-scope).

## Local startup

```bash
HUNTER_API_KEY=$HUNTER_API_KEY PORT=3000 node server.js
```

Open `http://localhost:3000/`. Chrome devtools Network tab helps confirm when `/api/find-jobs` does or does not fire.

First-run warmup: the server fetches ~200–500 jobs from 5 APIs and caches for 30 min in-memory. First search can take 20–60s; subsequent runs use cache and return in under a second.

## Golden path — the one thing that matters

Upload resume → top 5 cards must be recognizably in the resume's field, and the top 10 must have **zero** `Software Engineer`, `ML Engineer`, `Account Executive`, or `SEO` titles. That's the hard-fail criterion from Section 6 of the handoff. Anything else is secondary.

Fastest way to verify without the browser: POST the PDF to `/api/find-jobs` and grep the first 10 titles.

```bash
curl -s -F resume=@"./KyleGaarder_Resume_0426 (1).pdf" -F location=Anywhere \
  http://localhost:3000/api/find-jobs | jq -r '.jobs[:10][] | .title + "  ·  " + .company'
```

Test fixtures live at `test/fixtures/`: `kyle-hospitality.txt`, `kyle-real.txt`, `swe-engineer.txt`, `supply-chain.txt`. The handoff requires testing 3 resume types (hospitality, SWE, supply-chain) so the scoring isn't over-fit to Kyle.

Unit tests: `npm test` (Vitest, ~32 assertions across filters, keywords, parse-days-ago, scoring).

## Known issues that bite testing

1. **Pipeline UI is not rendered.** `renderUserJobs()` writes to `#user-job-list`, `addUserJob()` reads `#uj-title`/`#uj-company`, `loadInterviewPrep()` expects `#prep-facts-<id>`. None of those elements exist in `public/index.html`. Handoff Tests 7–8 are not reachable via click paths today, and `[A8]` (hide interview-prep facts for unmapped companies) is correct-but-unreachable. If a future ticket asks you to test pipeline/interview-prep end-to-end, either wire up the missing UI first or exercise the code path by injecting a stub container via DevTools and calling `loadInterviewPrep({company: …})` directly.
2. **Railway deploy drifts.** The `kyles-job-board-production.up.railway.app` deploy is frequently stale — new endpoints like `/healthz` and `/api/company-info` may 404, and `index.html` may predate recent fixes. Always test locally first; treat Railway as post-merge smoke only.
3. **`[B3]` non-English filter is an allowlist.** Jobs whose location doesn't clearly match an English-speaking market OR `remote/worldwide` are dropped. If a regression drops to zero results, the first suspect is this filter being too narrow. Titles containing German inclusive markers (`m/w/d`, `all genders`, `h/f`) are also dropped — don't be surprised.

## Structured recording annotations

When recording browser tests, annotate boundaries with `computer(action="record_annotate")`:
- `type="setup"` before each block (e.g. "Uploading Kyle's PDF").
- `type="test_start"` with `test="It should …"` per named test.
- `type="assertion"` with matching `test`, `test_result="passed"|"failed"|"untested"`, and a consolidated `assertion` string (≤80 chars). One assertion per meaningful state change — not one per UI element.

## Devin Secrets Needed

- `HUNTER_API_KEY` — Hunter.io email discovery. The key is also committed in `README.md` (public); flag the leak and recommend rotation when testing.

## Out of scope (don't break these)

See handoff Section 10. Short version: no database, no auth, no multi-tenancy, no Puppeteer/Chromium, do not edit the Curated Examples static `JOBS[]` array in `public/index.html`, do not push to the `old-repo` remote.
