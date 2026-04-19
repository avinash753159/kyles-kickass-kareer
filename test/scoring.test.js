// [A3] test suite — scoreFit matrix.
// The handoff lists "5 consecutive 'fix scoring' commits" — precisely because
// there was no test harness. Each scoring behavior we care about gets a test
// here so a blind rewrite can't regress silently.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scoreFit, extractResumeKeywords } = require('../server');

process.env.NODE_ENV = 'test';

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

const KYLE_RESUME = fixture('kyle-hospitality.txt');
const SWE_RESUME = fixture('swe-engineer.txt');
const SC_RESUME = fixture('supply-chain.txt');
const EE_RESUME = fixture('avinash-ee-phd.txt');

const KYLE_KW = extractResumeKeywords(KYLE_RESUME);
const SWE_KW = extractResumeKeywords(SWE_RESUME);
const SC_KW = extractResumeKeywords(SC_RESUME);
const EE_KW = extractResumeKeywords(EE_RESUME);

// ── Kyle (hospitality/ops) ─────────────────────────────────────────
test('scoreFit: Kyle resume + Community Manager @ Airbnb → hot (≥60)', () => {
  const job = { title: 'Community Manager, Member Experience', company: 'Airbnb',
    location: 'Austin, TX', description: 'Run community events, hospitality programming for 400+ members. Coworking background a plus.',
    tags: ['community', 'hospitality'] };
  const fit = scoreFit(job, KYLE_KW);
  assert.ok(fit >= 60, `expected ≥60, got ${fit}`);
});

test('scoreFit: Kyle resume + Senior Software Engineer → wrong-field (≤25)', () => {
  const job = { title: 'Senior Software Engineer, Backend', company: 'Stripe',
    location: 'Remote - USA', description: 'Design distributed systems in Go. Kubernetes, gRPC, Postgres.', tags: ['engineering'] };
  const fit = scoreFit(job, KYLE_KW);
  assert.ok(fit <= 25, `expected ≤25 (wrong-field clamp), got ${fit}`);
});

test('scoreFit: Kyle resume + ML Engineer → wrong-field (≤25)', () => {
  const job = { title: 'Machine Learning Engineer', company: 'Anthropic',
    location: 'SF, USA', description: 'LLM alignment research.', tags: [] };
  assert.ok(scoreFit(job, KYLE_KW) <= 25);
});

test('scoreFit: Kyle resume + Account Executive → wrong-field (≤25)', () => {
  const job = { title: 'Account Executive, Mid-Market', company: 'Salesforce',
    location: 'Austin, TX', description: 'Close $100k+ deals with mid-market SaaS customers.', tags: ['sales'] };
  assert.ok(scoreFit(job, KYLE_KW) <= 25);
});

// ── Software engineer ──────────────────────────────────────────────
test('scoreFit: SWE resume + Senior Backend Engineer → hot (≥60)', () => {
  const job = { title: 'Senior Backend Engineer', company: 'Vercel',
    location: 'Remote - USA', description: 'Go, Kubernetes, Postgres, distributed systems. Build and operate high-RPS services.', tags: ['engineering'] };
  assert.ok(scoreFit(job, SWE_KW) >= 60);
});

test('scoreFit: SWE resume + Warehouse Associate → wrong-field (≤25)', () => {
  const job = { title: 'Warehouse Associate', company: 'Amazon',
    location: 'Austin, TX', description: 'Package handling, forklift certified.', tags: [] };
  assert.ok(scoreFit(job, SWE_KW) <= 25);
});

// ── Supply chain (ops) ─────────────────────────────────────────────
test('scoreFit: Supply-chain resume + Supply Chain Manager → hot (≥60)', () => {
  const job = { title: 'Senior Supply Chain Manager, 3PL', company: 'Faire',
    location: 'Remote - USA', description: 'Manage global 3PL partners, freight procurement, warehouse operations, demand planning.', tags: ['supply chain', 'logistics'] };
  assert.ok(scoreFit(job, SC_KW) >= 60);
});

test('scoreFit: Supply-chain resume + Senior Software Engineer → wrong-field (≤25) — was [B1] regression', () => {
  // Before 2026-04-17, supply-chain resumes returned SWE roles at the top
  // because ops-flavor flags weren't gating the tech wrong-field check.
  const job = { title: 'Senior Software Engineer, Backend', company: 'Stripe',
    location: 'Remote - USA', description: 'Go, Kubernetes, distributed systems.', tags: ['engineering'] };
  assert.ok(scoreFit(job, SC_KW) <= 25);
});

test('scoreFit: Supply-chain resume + Warehouse Operations role → NOT wrong-field', () => {
  // This was exactly the regression [B1] fixed: warehouse/supply-chain/
  // procurement titles are correct for ops resumes. Make sure the gate works.
  const job = { title: 'Warehouse Operations Manager', company: 'Flexport',
    location: 'Chicago, IL', description: 'Run warehouse operations, inbound/outbound freight, WMS.', tags: ['logistics'] };
  const fit = scoreFit(job, SC_KW);
  assert.ok(fit >= 30, `warehouse ops should NOT be wrong-field for ops resume, got ${fit}`);
});

// ── Clamp bounds ───────────────────────────────────────────────────
test('scoreFit: result is always clamped to [5, 98]', () => {
  const empty = extractResumeKeywords('');
  const job = { title: '', company: '', location: '', description: '', tags: [] };
  const fit = scoreFit(job, empty);
  assert.ok(fit >= 5 && fit <= 98, `clamp violated: ${fit}`);
});

test('scoreFit: empty job title → low score', () => {
  const job = { title: '', company: 'Foo', location: 'USA', description: '', tags: [] };
  assert.ok(scoreFit(job, SWE_KW) <= 40);
});

// ── Freshness ──────────────────────────────────────────────────────
test('scoreFit: fresh post (today) scores higher than 45+ day old', () => {
  const base = { title: 'Senior Software Engineer', company: 'Stripe',
    location: 'Remote - USA', description: 'Go, Kubernetes', tags: [] };
  const fresh = scoreFit({ ...base, posted: 'today' }, SWE_KW);
  const stale = scoreFit({ ...base, posted: '2mo ago' }, SWE_KW);
  assert.ok(fresh > stale, `fresh ${fresh} should beat stale ${stale}`);
});

// ── PhD Electrical Engineer (Avinash) — added 2026-04-19 after wrong-field
// regression: hardware/semi resumes were ranking SWE / Employee Comms / PMM
// in the top 10. These guard scoreFit() from re-introducing that.
test('scoreFit: EE resume + Customer Quality Engineer (semiconductor) → hot (≥55)', () => {
  const job = { title: 'Customer Quality Engineer', company: 'SambaNova Systems',
    location: 'Palo Alto, CA',
    description: 'Lead failure analysis and yield improvement for AI training silicon. Customer-facing engineering for hyperscale data center deployments.',
    tags: ['hardware', 'semiconductor', 'data center'] };
  const fit = scoreFit(job, EE_KW);
  assert.ok(fit >= 55, `expected ≥55, got ${fit}`);
});

test('scoreFit: EE resume + Senior Software Engineer (Backend) → wrong-field (≤25)', () => {
  const job = { title: 'Senior Software Engineer, Backend', company: 'Stripe',
    location: 'Remote - USA',
    description: 'Build distributed systems in Go. Kubernetes, gRPC, Postgres.',
    tags: ['engineering'] };
  const fit = scoreFit(job, EE_KW);
  assert.ok(fit <= 25, `expected ≤25 wrong-field, got ${fit}`);
});

test('scoreFit: EE resume + Employee Communications Manager → wrong-field (≤25)', () => {
  const job = { title: 'Employee Communications Manager', company: 'Airbnb',
    location: 'SF, USA',
    description: 'Drive internal communications strategy across all teams.',
    tags: ['communications', 'people'] };
  const fit = scoreFit(job, EE_KW);
  assert.ok(fit <= 25, `expected ≤25 wrong-field, got ${fit}`);
});

test('scoreFit: EE resume + Product Marketing Manager → wrong-field (≤25)', () => {
  const job = { title: 'Product Marketing Manager, Pricing', company: 'Stripe',
    location: 'Remote - USA',
    description: 'Lead pricing strategy and go-to-market for new payment products.',
    tags: ['marketing', 'product'] };
  const fit = scoreFit(job, EE_KW);
  assert.ok(fit <= 25, `expected ≤25 wrong-field, got ${fit}`);
});

test('scoreFit: EE resume + Senior Yield Engineer → hot (≥55)', () => {
  // Yield engineering is a direct title-keyword overlap with the EE resume.
  // Same domain (semiconductor manufacturing).
  const job = { title: 'Senior Yield Engineer', company: 'SambaNova Systems',
    location: 'Palo Alto, CA',
    description: 'Drive yield improvement and failure analysis for AI silicon at advanced nodes (5nm/7nm).',
    tags: ['hardware', 'semiconductor'] };
  const fit = scoreFit(job, EE_KW);
  assert.ok(fit >= 55, `expected ≥55, got ${fit}`);
});

// Regression guard for Devin Review finding (2026-04-19): the semiconductor
// "process node" term collided with the Node.js token in the
// resumeIsSoftware check. An EE resume mentioning "14nm node" would flip
// `resumeIsSoftware=true`, short-circuit the hardware wrong-field guard,
// and let infrastructure/SWE roles score in the hot band.
test('scoreFit: EE resume + Senior Infrastructure Engineer → wrong-field (≤25)', () => {
  const job = { title: 'Senior Infrastructure Engineer', company: 'AWS',
    location: 'Seattle, WA',
    description: 'Own cloud infrastructure at scale. Go, Kubernetes, Terraform, large distributed systems.',
    tags: ['engineering', 'infrastructure'] };
  const fit = scoreFit(job, EE_KW);
  assert.ok(fit <= 25, `expected ≤25 (hardware resume, not software), got ${fit}`);
});

// ── Hunter contact ranker ─────────────────────────────────────────
const { rankHunterContacts } = require('../server');

test('rankHunterContacts: recruiter outranks CEO', () => {
  const emails = [
    { value: 'ceo@acme.com', first_name: 'Bob', last_name: 'Boss', position: 'Chief Executive Officer', confidence: 95 },
    { value: 'jane@acme.com', first_name: 'Jane', last_name: 'Hire', position: 'Senior Recruiter, Engineering', confidence: 88 },
  ];
  const ranked = rankHunterContacts(emails, 'Senior Backend Engineer');
  assert.equal(ranked[0].email, 'jane@acme.com');
});

test('rankHunterContacts: drops empty-position rows + executive assistants', () => {
  const emails = [
    { value: 'noinfo@acme.com', first_name: 'Anon', last_name: 'User', position: '', confidence: 90 },
    { value: 'ea@acme.com', first_name: 'Sam', last_name: 'EA', position: 'Executive Assistant to the CEO', confidence: 90 },
    { value: 'tl@acme.com', first_name: 'Pat', last_name: 'Lead', position: 'Director of Engineering', confidence: 80 },
  ];
  const ranked = rankHunterContacts(emails, 'Backend Engineer');
  const emailsList = ranked.map(r => r.email);
  assert.ok(emailsList.includes('tl@acme.com'));
  assert.ok(!emailsList.includes('noinfo@acme.com'));
  assert.ok(!emailsList.includes('ea@acme.com'));
});

test('rankHunterContacts: same-discipline match wins overlap bonus', () => {
  const emails = [
    { value: 'mktg@acme.com', first_name: 'M', last_name: 'X', position: 'Marketing Director', confidence: 85 },
    { value: 'eng@acme.com', first_name: 'E', last_name: 'Y', position: 'Engineering Director', confidence: 85 },
  ];
  const ranked = rankHunterContacts(emails, 'Senior Backend Engineer');
  assert.equal(ranked[0].email, 'eng@acme.com');
});
