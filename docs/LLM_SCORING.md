# LLM-Based Job Scoring

## Model
Claude Haiku 4.5 (`claude-haiku-4-5`). Chosen for speed + low cost at 60-job batches; the resume is re-processed per call (~3K input tokens) — no prefix caching of the resume since the resume varies per search.

## Shape
- **Phase 1** — keyword pre-filter: ~500 fetched jobs → 60 candidates via `scoreFit` + market/location/English-title filters (unchanged).
- **Phase 2** — LLM rank: the 60 candidates + resume → one `messages.create` call with JSON schema output (`SCORE_SCHEMA` in `lib/llm-scorer.js`).
- Top 20 returned to the UI, each with `fit` (0-100) and `fitReason` (one-line reason citing the candidate's actual work history).

## Why LLM instead of keywords
The keyword scorer matches surface terms — any mention of "product" in a resume inflates scores on generic Product Manager roles. Kyle Gaarder's actual niche is coliving/coworking/community operations, but the keyword scorer put "Lyft Group PM, Pricing" at 75% fit because "product" and "pricing" appeared near each other. With LLM scoring the same job drops to ~15% — correctly reflecting that he has no pricing strategy, marketplace economics, or transportation experience.

## Cost
~9K input + ~3K output per search = ~$0.024 at Haiku list price. At 60 jobs × ~150 tokens each (trimmed title+company+location+400-char description) the prompt stays well under the 200K Haiku context.

## Latency
~5-8s for the LLM call, on top of the existing 1-3s job-fetch + pre-filter. Total cold-cache search is ~15-25s on first run; subsequent runs within 30 min hit the job cache (~6-10s total).

## Fallback
If `ANTHROPIC_API_KEY` is unset or the LLM call throws, the handler logs the event (`ANTHROPIC_API_KEY missing — falling back to keyword scoring` or `LLM scoring failed: <message> — falling back to keyword`) and uses the keyword `keywordFit` for each job, with a lower `minFit` threshold (40 for keyword, 55 for LLM). Every job in the response has a `scoredBy: 'llm' | 'keyword'` field so the UI can distinguish modes if needed.

## Disable
Unset `ANTHROPIC_API_KEY` or set it to an empty string to run in keyword-only mode. No code change needed.

## Prompt caching
The system prompt (scoring rubric) is marked `cache_control: { type: 'ephemeral' }` so it reads cheap on repeat searches within the 5-minute Anthropic cache TTL. The resume is intentionally kept in the user message (not cached) because it varies per search — interpolating it into a cached system prompt would invalidate the cache on every call.

## Related files
- `lib/llm-scorer.js` — pure helpers (`buildPrompt`, `parseScores`, schema) + `scoreJobsWithLLM` SDK call
- `test/llm-scorer.test.js` — unit tests for the pure helpers
- `server.js` `/api/find-jobs` handler — integration point, ~line 498
- `public/index.html` `renderUserResults` — renders `fitReason` as "Why this fits" on each card
- `.env.example` — documents `ANTHROPIC_API_KEY`
