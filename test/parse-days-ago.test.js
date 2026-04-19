// [A3] test suite — parseDaysAgo + daysAgoFromJob ([B6] postedDate propagation).

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDaysAgo, daysAgoFromJob, timeAgo } = require('../server');

test('parseDaysAgo — handles the canonical forms', () => {
  assert.equal(parseDaysAgo('today'), 0);
  assert.equal(parseDaysAgo('1d ago'), 1);
  assert.equal(parseDaysAgo('7d ago'), 7);
  assert.equal(parseDaysAgo('29d ago'), 29);
  assert.equal(parseDaysAgo('1mo ago'), 30);
  assert.equal(parseDaysAgo('3mo ago'), 90);
});

test('parseDaysAgo — returns null for empty / unparseable', () => {
  assert.equal(parseDaysAgo(''), null);
  assert.equal(parseDaysAgo(null), null);
  assert.equal(parseDaysAgo(undefined), null);
  assert.equal(parseDaysAgo('recently'), null);
  assert.equal(parseDaysAgo('a month ago'), null);
});

test('parseDaysAgo ↔ timeAgo round-trips for days ≤ 29', () => {
  for (const d of [0, 1, 2, 7, 14, 28]) {
    const ago = timeAgo(new Date(Date.now() - d * 86400000));
    const back = parseDaysAgo(ago);
    // timeAgo('today') vs parseDaysAgo('today') both yield 0; everything else
    // should round-trip exactly.
    assert.equal(back, d, `timeAgo(${d}d) → ${ago} → parseDaysAgo → ${back}`);
  }
});

test('daysAgoFromJob — prefers postedDate over posted string', () => {
  // If both are present, postedDate wins (it's lossless).
  const j = { postedDate: new Date(Date.now() - 5 * 86400000), posted: '29d ago' };
  assert.equal(daysAgoFromJob(j), 5);
});

test('daysAgoFromJob — falls back to posted string when postedDate missing', () => {
  // Pre-[B6] jobs only had `posted` — the fallback keeps them working.
  assert.equal(daysAgoFromJob({ posted: '14d ago' }), 14);
  assert.equal(daysAgoFromJob({ posted: 'today' }), 0);
  assert.equal(daysAgoFromJob({ posted: '' }), null);
  assert.equal(daysAgoFromJob({}), null);
});

test('daysAgoFromJob — preserves precision that parseDaysAgo loses (B6 regression)', () => {
  // 31 days is "1mo ago" in string form which parseDaysAgo rounds to exactly 30.
  // With postedDate, we know it's actually 31 → would tip from 'aging' to 'stale'.
  const j = { postedDate: new Date(Date.now() - 31 * 86400000), posted: '1mo ago' };
  assert.equal(daysAgoFromJob(j), 31);
  assert.equal(parseDaysAgo(j.posted), 30);
});

test('daysAgoFromJob — handles invalid dates', () => {
  const j = { postedDate: new Date('not-a-date') };
  assert.equal(daysAgoFromJob(j), null);
});
