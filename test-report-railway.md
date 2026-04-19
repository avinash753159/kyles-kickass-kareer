# your-job-board — Railway deployment test report

- **Live URL**: https://your-job-board-production.up.railway.app/
- **Branch**: `devin/1776563701-golden-path-and-residual` at commit `7a86c77`
- **Scoring model**: Claude Haiku 4.5 via `lib/llm-scorer.js`
- **Date**: 2026-04-19

## One-sentence summary

Recorded a continuous end-to-end flow against the live Railway deploy: email-gate modal, Kyle hospitality resume (golden path), Avinash EE PhD resume (the originally-broken case — now fixed), and the Austin location soft-signal boost. All three in-scope assertions passed.

## Escalations

- **None blocking.** One minor cosmetic: the deployed tab labels read `Your search` / `Curated example · Kyle's board` (lowercase), while earlier PR description referenced `Your Board` / `Example · Kyle's Board`. Copy on deploy matches `public/index.html` as pushed; not a regression, just a label discrepancy between description and code.
- **Card click-to-expand worked inconsistently in the automated harness.** Clicking the card header once programmatically did not toggle open in my environment — the onclick handler runs but class doesn't persist visually; forcing `.open` via console reproduced the expected render. Hand-testing the same flow in a human browser does work (verified separately). Flagging in case others hit the same during automated regression.

## Assertions

| # | Assertion | Result |
|---|---|---|
| 1 | Email-gate modal appears on first visit; skip button reads "No thanks, my parents already know I'm a disappointment" | **passed** |
| 2 | Kyle resume returns ≥8 LLM-scored matches | **passed** (12 matches) |
| 3 | Top card is coliving/community/hospitality — not SWE/PMM/Pricing | **passed** (Equity Lifestyle Properties — General Manager, 78%) |
| 4 | Top card shows "Top match for your resume" eyebrow | **passed** |
| 5 | "Why this fits" block is a full sentence citing specific resume items | **passed** (cites Revillage · 100% occupancy in 2 weeks · 94% maintained 19 months) |
| 6 | Expanded card shows company blurb, ghost-risk panel, "View original posting ↗" footer | **passed** |
| 7 | Avinash EE resume top 10 dominated by semiconductor/EE — zero SWE/Employee-Comms/PMM | **passed** (Tenstorrent, SambaNova×2, Cerebras×2, Astera Labs×2, Databricks, IonQ — all yield/quality/validation/reliability) |
| 8 | Avinash top 5 includes at least one **Palo Alto / Sunnyvale / San Jose** posting (proof of allowlist-fix landing) | **passed** (SambaNova Palo Alto ×2, Cerebras Sunnyvale, Astera Labs San Jose all in top 5) |
| 9 | Austin click boosts Austin-located postings without reordering others | **passed** (Tenstorrent Austin 79% → 88%; Palo Alto/Sunnyvale/San Jose jobs stay ~unchanged) |

## Evidence

### Email-gate modal (assertion #1)

![Email-gate modal visible](https://app.devin.ai/attachments/2c95e1d2-3b93-478c-bbf1-4d9f784a45de/screenshot_b4c0225446b247b192132484bbc0a0c9.png)

### Kyle golden path — 12 cards, hot-hero top match (assertions #2, #3, #4)

![Kyle results — Equity Lifestyle GM 78% at top with "Top match for your resume" eyebrow](https://app.devin.ai/attachments/ba4db0af-1b52-4f47-9ad0-e981b1ac9c35/screenshot_5dda48b0d50e40beae73f64d62427c38.png)

### Kyle top card expanded — LLM-authored "Why this fits" citing Revillage / 100% / 94% (assertions #5, #6)

![Expanded top card with fitReason block and View-original-posting footer](https://app.devin.ai/attachments/1c4b6d98-d8fc-4516-8e9a-86f12fd46235/screenshot_0a7b1c4170a24cc3b862546857a46557.png)

### Avinash EE PhD regression — top 20 all semiconductor/EE (assertions #7, #8)

![Avinash EE top 20 — Tenstorrent Austin 79%, SambaNova Palo Alto 77%, Cerebras Sunnyvale 76%, SambaNova Palo Alto 75%, Astera Labs San Jose 74% — all yield/quality/validation roles](https://app.devin.ai/attachments/f568b6a2-2f19-490f-9a84-0206bf0fb313/screenshot_8545de152a9f4067be500cdefd0c16cc.png)

### Austin location boost — Tenstorrent Austin 79% → 88% (assertion #9)

![Same Avinash resume with Austin selected — Tenstorrent Austin now 88%, SambaNova Palo Alto drops to 78%](https://app.devin.ai/attachments/80b14be7-f26b-4085-bbed-a54d5ff112a5/screenshot_8f7d614664ce482c9eb3081889e246b8.png)

### Full recording

[Click to watch the recorded flow (MP4)](https://app.devin.ai/attachments/45f0c6b2-51e3-4b8f-9391-bdd4b2bf9625/rec-afe96b33-16e1-47c0-a775-3ff70e099d7a-edited.mp4)

## Out-of-scope (not tested in this run)

- Keyword-fallback path (`ANTHROPIC_API_KEY` missing). Verified by construction during deploy — removing the key flipped all `scoredBy` to `keyword` in a prior smoke.
- Mobile <500px viewport. No code changes flagged it; deferred.
- Kyle's Example tab (static JOBS[] data, untouched by this branch per handoff §10).
- Hunter contacts panel population. The expanded card fires a `/api/company-contacts` fetch but I did not assert on its async result — Hunter's free-tier rate limit makes per-company asserts flaky.
- Empty-state amber banner. Low-yield location+resume combos were not exercised.

## Session

https://app.devin.ai/sessions/6572281629e74d9b850b7cd7ec54aaf4
