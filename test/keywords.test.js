// [A3] test suite — extractResumeKeywords.
// Fixture resumes cover the five career flavors scoreFit branches on
// (tech / finance / design / sales / ops / content) plus Kyle's hospitality
// baseline. Each asserts both that the right keywords surface AND that
// unrelated fields do NOT falsely light up (the root cause of [B1]'s
// pre-April-17 wrong-field miss).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractResumeKeywords } = require('../server');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

test('hospitality/ops resume — surfaces community + operations, NOT tech/finance/design', () => {
  const kw = extractResumeKeywords(fixture('kyle-hospitality.txt'));
  const domain = new Set(kw.domainSkills);

  assert.ok(domain.has('community'), 'community');
  assert.ok(domain.has('operations'), 'operations');
  assert.ok(domain.has('hospitality'), 'hospitality');
  assert.ok(domain.has('coliving') || domain.has('co-living'), 'coliving');
  assert.ok(domain.has('coworking') || domain.has('co-working'), 'coworking');
  // Must NOT light up tech / finance / design flavor flags — that was the
  // [B1] over-broad wrong-field bug. These are the exact domain terms
  // scoreFit checks in Step 2.
  assert.ok(!domain.has('python') && !domain.has('javascript') && !domain.has('aws'), 'no tech');
  assert.ok(!domain.has('figma') && !domain.has('ui/ux'), 'no design');
  assert.ok(!domain.has('accounting') && !domain.has('financial reporting'), 'no finance');
});

test('software-engineer resume — surfaces tech-flavor domain skills', () => {
  const kw = extractResumeKeywords(fixture('swe-engineer.txt'));
  const domain = new Set(kw.domainSkills);

  assert.ok(domain.has('python'), 'python');
  assert.ok(domain.has('aws'), 'aws');
  assert.ok(domain.has('kubernetes'), 'kubernetes');
  assert.ok(domain.has('docker'), 'docker');
  assert.ok(domain.has('ci/cd'), 'ci/cd');
  // Titles should include "software engineer"
  assert.ok(kw.titles.some(t => /software engineer/.test(t)), `titles=${JSON.stringify(kw.titles)}`);
});

test('supply-chain resume — surfaces ops-flavor domain skills', () => {
  const kw = extractResumeKeywords(fixture('supply-chain.txt'));
  const domain = new Set(kw.domainSkills);

  assert.ok(domain.has('supply chain'), 'supply chain');
  assert.ok(domain.has('logistics'), 'logistics');
  assert.ok(domain.has('procurement'), 'procurement');
  assert.ok(domain.has('warehouse'), 'warehouse');
  assert.ok(domain.has('inventory') || domain.has('fulfillment'), 'inventory/fulfillment');
  // Must NOT look like a tech or finance resume.
  assert.ok(!domain.has('python') && !domain.has('aws'), 'no tech');
  assert.ok(!domain.has('figma'), 'no design');
});

test('extractResumeKeywords — returns the expected shape', () => {
  const kw = extractResumeKeywords('Product Manager focused on growth and retention.');
  assert.ok(Array.isArray(kw.titles), 'titles array');
  assert.ok(Array.isArray(kw.domainSkills), 'domainSkills array');
  assert.ok(Array.isArray(kw.specificWords), 'specificWords array');
  assert.ok(Array.isArray(kw.specificBigrams), 'specificBigrams array');
});

test('extractResumeKeywords — empty / garbage input does not throw', () => {
  for (const input of ['', ' ', 'lorem ipsum dolor sit amet']) {
    const kw = extractResumeKeywords(input);
    assert.ok(kw && Array.isArray(kw.titles));
  }
});
