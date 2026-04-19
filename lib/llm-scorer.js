// lib/llm-scorer.js
// LLM-based semantic job scoring. The keyword scorer matches surface
// words ("product", "growth") and inflates generic PM roles for niche
// operator resumes. This module sends the resume + candidate jobs to
// Claude Haiku 4.5 and asks it to score by career trajectory, not keywords.

const MODEL = 'claude-haiku-4-5';
const MAX_JOBS_PER_CALL = 40;

// jobs are trimmed server-side to these fields to keep the prompt tight.
function jobSummary(j) {
  const title = String(j.title || '').trim();
  const company = String(j.company || '').trim();
  const loc = String(j.location || '').trim();
  const desc = String(j.description || '').replace(/\s+/g, ' ').slice(0, 400);
  return `id: ${j.id}\ntitle: ${title}\ncompany: ${company}\nlocation: ${loc}\ndescription: ${desc}`;
}

function buildPrompt(resumeText, jobs) {
  const system = [
    'You score how well a resume matches each job based on the candidate\'s actual career trajectory — the roles they have held, the niche they operate in, and the kinds of problems they solve — NOT on surface keyword overlap.',
    'A resume that mentions "product" as a tool should NOT match "Product Manager" roles at unrelated companies; it should match roles in the same niche as the candidate\'s prior work.',
    'For each job, return a fit score from 0 to 100 and a one-line reason citing the candidate\'s prior experience.',
    'Return ONLY the JSON object required by the schema.'
  ].join('\n\n');

  const jobBlocks = jobs.slice(0, MAX_JOBS_PER_CALL).map(jobSummary).join('\n---\n');
  const user = `RESUME:\n${resumeText}\n\n===\n\nJOBS TO SCORE:\n${jobBlocks}\n\n===\n\nScore each job by how well it fits this candidate\'s actual career, not keyword overlap.`;

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

module.exports = { buildPrompt, parseScores, SCORE_SCHEMA, MODEL, MAX_JOBS_PER_CALL };
