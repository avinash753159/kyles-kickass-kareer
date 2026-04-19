// lib/llm-scorer.js
// LLM-based semantic job scoring. The keyword scorer matches surface
// words ("product", "growth") and inflates generic PM roles for niche
// operator resumes. This module sends the resume + candidate jobs to
// Claude and asks it to score by career trajectory, not keywords.
//
// Model: Opus 4.7 — the user explicitly asked for "the best analysis to
// find the best job for the person". Opus gives the highest-quality
// judgment on career fit. Cost tradeoff: ~$0.12/search vs Haiku's ~$0.03,
// acceptable given the value is job-search quality. Adaptive thinking
// turned on so Claude can actually reason about each role rather than
// pattern-match.

const MODEL = 'claude-opus-4-7';
// Must stay in sync with the candidate-slice size in server.js /api/find-jobs.
// If server.js narrows to N candidates but this is smaller, the last (N-this)
// candidates silently fall through to keyword-only scoring — a mid-tier data
// loss bug the reviewer caught on first integration.
const MAX_JOBS_PER_CALL = 60;

// jobs are trimmed server-side to these fields to keep the prompt tight.
function jobSummary(j) {
  const id = String(j.id || '').trim();
  const title = String(j.title || '').trim();
  const company = String(j.company || '').trim();
  const loc = String(j.location || '').trim();
  const desc = String(j.description || '').replace(/\s+/g, ' ').slice(0, 400);
  return `id: ${id}\ntitle: ${title}\ncompany: ${company}\nlocation: ${loc}\ndescription: ${desc}`;
}

function buildPrompt(resumeText, jobs) {
  const system = [
    'You are an expert career-matching analyst. Given a resume and a batch of job postings, you score how well each job matches the candidate based on their actual career trajectory — not surface keyword overlap.',

    'CORE PRINCIPLE: keyword overlap misleads. A resume that mentions "product" as a tool ("shipped product X") does NOT make the person a Product Manager candidate for a Pricing team at a marketplace. Score the CANDIDATE\'s demonstrable identity — the roles they\'ve held, the niche they\'ve operated in, and the specific problems they\'ve solved — against what the job actually does.',

    'SCORING RUBRIC (0–100):',
    '  90–100: Near-identical fit. The candidate has done this exact role, at a peer company, and their resume proves it line-by-line. "They would be a Day-1 contributor."',
    '  75–89:  Strong fit. The core responsibilities map onto the candidate\'s demonstrated skills and domain. Some ramp-up required but their instinct would transfer.',
    '  60–74:  Adjacent fit. Related domain OR related function, but not both. The candidate could do this, but it\'s a sideways move — not their strongest positioning.',
    '  40–59:  Weak fit. A few surface keywords match but the career trajectory doesn\'t support it. Risk of being screened out by a recruiter who reads carefully.',
    '  0–39:   Bad fit. The candidate has no trajectory toward this role. Putting them forward would waste everyone\'s time.',

    'WEIGHT THESE SIGNALS:',
    '  1. Actual prior titles. "Community Manager at Industrious" means they can do "Community Manager at WeWork." It does NOT mean they can do "Product Manager at Stripe" just because the word "manager" appears in both.',
    '  2. Industry/niche. A coliving operator is a strong fit for Sonder, Kindred, Outsite. A mediocre fit for generic marketplaces. A weak fit for SaaS enterprise.',
    '  3. Stage and company size. A 3-person-startup founder fits seed-stage generalist roles; often a misfit at senior-IC roles in 5000-person public companies (and vice versa).',
    '  4. Functional depth. A "full-stack" resume with a line about data doesn\'t make them a Data Scientist candidate; pattern-match on depth, not breadth.',
    '  5. Seniority. A 2-year PM at a startup is not a candidate for "Director of Product" at FAANG regardless of how well the keywords match.',

    'DO NOT:',
    '  - Inflate scores for roles that share words with the resume but aren\'t in the candidate\'s actual career path.',
    '  - Assume "management" on the resume means the person can do any "manager" role.',
    '  - Be charitable. A recruiter would reject these resumes for low-fit roles; your scores should match that reality.',
    '  - Reward seniority inflation. Someone whose resume tops out at "Senior Associate" is not a match for "VP" or "Director" titles.',

    'FORMAT: for each job, return fit (integer 0–100) and reason (≤ 240 chars citing the candidate\'s SPECIFIC prior experience — names of companies, numbers, outcomes — that drove the score). Avoid generic phrases like "strong leadership skills"; reference what the resume actually says.',

    'Return ONLY the JSON object required by the schema.'
  ].join('\n\n');

  const jobBlocks = jobs.slice(0, MAX_JOBS_PER_CALL).map(jobSummary).join('\n---\n');
  const user = `RESUME:\n${resumeText}\n\n===\n\nJOBS TO SCORE (${jobs.length} total):\n${jobBlocks}\n\n===\n\nScore each job per the rubric. Be honest — a score of 95 should be rare; most jobs will land 40–70.`;

  return { system, user };
}

const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          fit: { type: 'integer' },
          reason: { type: 'string' }
        },
        required: ['id', 'fit', 'reason'],
        additionalProperties: false
      }
    }
  },
  required: ['scores'],
  additionalProperties: false
};

function parseScores(raw, validIds) {
  const validSet = new Set(validIds);
  const out = [];
  for (const s of (raw && raw.scores) || []) {
    if (!s || typeof s.id !== 'string') continue;
    if (!validSet.has(s.id)) continue;
    const fitRaw = Number(s.fit);
    const fit = Math.max(0, Math.min(100, Number.isFinite(fitRaw) ? Math.round(fitRaw) : 0));
    const reason = String(s.reason || '').slice(0, 240);
    out.push({ id: s.id, fit, reason });
  }
  return out;
}

// Lazy-imported so tests don't require ANTHROPIC_API_KEY.
let _client = null;
function getClient() {
  if (_client) return _client;
  const Anthropic = require('@anthropic-ai/sdk');
  _client = new Anthropic();
  return _client;
}

// Score up to MAX_JOBS_PER_CALL jobs in one call.
// Returns [{id, fit, reason}]. Caller is responsible for fallback on throw.
async function scoreJobsWithLLM(resumeText, jobs, { signal } = {}) {
  if (!resumeText || !resumeText.trim()) throw new Error('resumeText required');
  if (!Array.isArray(jobs) || jobs.length === 0) return [];

  const client = getClient();
  const trimmed = jobs.slice(0, MAX_JOBS_PER_CALL);
  const { system, user } = buildPrompt(resumeText, trimmed);

  // Stream the response so long Opus + adaptive thinking runs don't hit the
  // SDK's default HTTP timeout. We don't expose streaming to the client —
  // we just collect the final message internally.
  //
  // Adaptive thinking: Opus 4.7 chooses its own thinking depth per request.
  // Career-fit scoring is judgment-heavy (niche alignment, seniority, stage
  // fit) so giving the model thinking room materially improves quality.
  //
  // Prompt caching: the scoring rubric (system prompt) is stable across all
  // searches — cache it. The resume varies, so it stays in the user message.
  // Adaptive thinking + effort are Opus/Sonnet 4.6+ only — Haiku rejects them.
  const isOpusOrSonnet = MODEL.startsWith('claude-opus-') || MODEL.startsWith('claude-sonnet-');
  const params = {
    model: MODEL,
    max_tokens: isOpusOrSonnet ? 16000 : 6000,
    output_config: isOpusOrSonnet
      ? { effort: 'high', format: { type: 'json_schema', schema: SCORE_SCHEMA } }
      : { format: { type: 'json_schema', schema: SCORE_SCHEMA } },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }]
  };
  if (isOpusOrSonnet) params.thinking = { type: 'adaptive' };

  const stream = client.messages.stream(params, { signal });

  const response = await stream.finalMessage();
  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('LLM returned no text block');

  let parsed;
  try { parsed = JSON.parse(textBlock.text); }
  catch (e) { throw new Error('LLM returned non-JSON: ' + textBlock.text.slice(0, 200)); }

  const validIds = trimmed.map(j => j.id);
  return parseScores(parsed, validIds);
}

module.exports = {
  buildPrompt,
  parseScores,
  SCORE_SCHEMA,
  MODEL,
  MAX_JOBS_PER_CALL,
  scoreJobsWithLLM
};
