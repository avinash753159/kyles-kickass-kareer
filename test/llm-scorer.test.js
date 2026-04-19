// test/llm-scorer.test.js
const test = require('node:test');
const assert = require('node:assert');
const { buildPrompt, parseScores } = require('../lib/llm-scorer');

test('buildPrompt includes resume text and every job ID', () => {
  const resume = 'Kyle Gaarder — community operator. 48 events run.';
  const jobs = [
    { id: 'job-1', title: 'Community Manager', company: 'Kindred', description: 'coliving community' },
    { id: 'job-2', title: 'Pricing PM', company: 'Lyft', description: 'pricing team' }
  ];
  const { system, user } = buildPrompt(resume, jobs);
  assert.ok(system.includes('career trajectory'), 'system prompt names the scoring criterion');
  assert.ok(user.includes('Kyle Gaarder'), 'resume text is in user message');
  assert.ok(user.includes('job-1') && user.includes('job-2'), 'all job IDs appear');
  assert.ok(user.includes('Kindred') && user.includes('Lyft'), 'job companies appear');
});

test('parseScores returns id+fit+reason for each job, bounded 0-100', () => {
  const raw = { scores: [
    { id: 'job-1', fit: 88, reason: 'Community ops is his core identity' },
    { id: 'job-2', fit: 22, reason: 'Pricing PM is tangential — no pricing work in resume' }
  ]};
  const result = parseScores(raw, ['job-1', 'job-2']);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].id, 'job-1');
  assert.strictEqual(result[0].fit, 88);
  assert.ok(result[0].reason.length > 0);
  assert.ok(result[1].fit >= 0 && result[1].fit <= 100);
});

test('parseScores clamps out-of-range scores and drops unknown job IDs', () => {
  const raw = { scores: [
    { id: 'job-1', fit: 150, reason: 'over' },
    { id: 'job-2', fit: -5, reason: 'under' },
    { id: 'ghost',  fit: 50, reason: 'hallucinated id' }
  ]};
  const result = parseScores(raw, ['job-1', 'job-2']);
  assert.strictEqual(result.length, 2, 'ghost id dropped');
  assert.strictEqual(result[0].fit, 100, 'high clamped to 100');
  assert.strictEqual(result[1].fit, 0, 'low clamped to 0');
});
