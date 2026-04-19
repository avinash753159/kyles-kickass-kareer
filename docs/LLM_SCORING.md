# LLM-Based Job Scoring

## Model
Claude Opus 4.7 (`claude-opus-4-7`) with adaptive thinking (`thinking: {type: "adaptive"}`) and `effort: "high"`. Upgraded from Haiku 4.5 when the product priority shifted to "best matches, cost-is-secondary." Opus is materially more honest about borderline fits — low scores go genuinely low (a coliving operator getting 5% on Lyft Pricing PM, not Haiku's charitable 15%) and reasons cite specific line items from the resume rather than generic phrases. The SDK call uses `client.messages.stream()` + `.finalMessage()` so long Opus + thinking runs don't hit default HTTP timeouts.

## Shape
- **Phase 1** — keyword pre-filter: ~500 fetched jobs → 60 candidates via `scoreFit` + market/location/English-title filters (unchanged).
- **Phase 2** — LLM rank: the 60 candidates + resume → one `messages.create` call with JSON schema output (`SCORE_SCHEMA` in `lib/llm-scorer.js`).
- Top 20 returned to the UI, each with `fit` (0-100) and `fitReason` (one-line reason citing the candidate's actual work history).

## Why LLM instead of keywords
The keyword scorer matches surface terms — any mention of "product" in a resume inflates scores on generic Product Manager roles. Kyle Gaarder's actual niche is coliving/coworking/community operations, but the keyword scorer put "Lyft Group PM, Pricing" at 75% fit because "product" and "pricing" appeared near each other. With LLM scoring the same job drops to ~15% — correctly reflecting that he has no pricing strategy, marketplace economics, or transportation experience.

## Cost
~9K input + ~3K-6K output per search = **~$0.10–$0.18 at Opus 4.7 list price** ($5/$25 per 1M tokens). Adaptive thinking adds hidden thinking tokens (billed at output rate); rough empirical range is ~1-3K thinking tokens per search. All together the upper bound per search is roughly $0.20. System-prompt caching cuts input cost after the first search in a 5-min window.

## Latency
~20-40s for the Opus + adaptive-thinking call on 60 jobs (10s for 5 jobs in the smoke test; scaling is sub-linear due to prompt caching on the system block). Total cold-cache search is ~30-50s; warm is ~25-40s.

Streaming is used internally (via `client.messages.stream().finalMessage()`) to avoid the SDK's default HTTP timeout on long responses — users still see a single non-streaming JSON payload.

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
