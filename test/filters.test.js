// [A3] test suite — [B3] non-English-market allowlist filter.
// These fixtures are real job location strings observed in production API
// responses. If a future "fix" regresses one of them, the test should catch
// it before it lands in a PR.

const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedMarketLocation, isAllowedMarketTitle } = require('../server');

test('isAllowedMarketLocation — keeps pure US locations', () => {
  for (const loc of [
    'United States',
    'USA',
    'Austin, TX',
    'Austin, Texas, United States',
    'San Francisco, CA',
    'New York, NY',
    'Remote - USA',
    'Remote, United States',
    'SF, NYC, Seattle, US Remote',
  ]) {
    assert.equal(isAllowedMarketLocation(loc), true, `expected kept: ${loc}`);
  }
});

test('isAllowedMarketLocation — keeps legitimate US-EMEA hybrid remote (B3 regression)', () => {
  // The old blocklist dropped these — that was the core B3 miss.
  for (const loc of [
    'Remote (US/EMEA)',
    'Remote - Americas / EMEA',
    'Remote - Global',
    'Worldwide',
    'US / Europe',
    'Anywhere',
  ]) {
    assert.equal(isAllowedMarketLocation(loc), true, `expected kept: ${loc}`);
  }
});

test('isAllowedMarketLocation — keeps English-speaking markets beyond US', () => {
  for (const loc of [
    'London, UK',
    'Dublin, Ireland',
    'Toronto, Canada',
    'Sydney, Australia',
    'Auckland, New Zealand',
    'Remote - Canada',
    'Manchester, England',
  ]) {
    assert.equal(isAllowedMarketLocation(loc), true, `expected kept: ${loc}`);
  }
});

test('isAllowedMarketLocation — drops clearly non-English markets', () => {
  // The old blocklist missed several of these (Rome, Cambodia, Costa Rica).
  for (const loc of [
    'Bengaluru, India',
    'Remote - India',
    'Phnom Penh, Cambodia',
    'Costa Rica',
    'São Paulo, Brazil',
    'Tokyo, Japan',
    'Shanghai, China',
    'Berlin, Germany',
    'Paris, France',
    'Mexico City, Mexico',
    'Karachi, Pakistan',
  ]) {
    assert.equal(isAllowedMarketLocation(loc), false, `expected dropped: ${loc}`);
  }
});

test('isAllowedMarketLocation — drops mixed locations with explicit non-English country', () => {
  // Even though "USA" matches the allowlist, a paired "India" tips it into
  // "primarily non-English hiring market" territory.
  for (const loc of [
    'Remote - USA / India',
    'San Francisco / Bengaluru',
    'New York / Tokyo',
  ]) {
    assert.equal(isAllowedMarketLocation(loc), false, `expected dropped: ${loc}`);
  }
});

test('isAllowedMarketLocation — empty / missing passes (benefit of doubt)', () => {
  assert.equal(isAllowedMarketLocation(''), true);
  assert.equal(isAllowedMarketLocation(null), true);
  assert.equal(isAllowedMarketLocation(undefined), true);
});

test('isAllowedMarketTitle — keeps English titles', () => {
  for (const t of [
    'Senior Software Engineer',
    'Product Manager, Growth',
    'Community Manager',
    'Warehouse Operations Lead',
  ]) {
    assert.equal(isAllowedMarketTitle(t), true, `expected kept: ${t}`);
  }
});

test('isAllowedMarketTitle — drops German/French inclusive-marker titles', () => {
  for (const t of [
    'Software Engineer (m/w/d)',
    'Product Manager (all genders)',
    'DevOps Engineer m/f/d',
    'Data Scientist w/m/d',
    'Ingénieur h/f',
  ]) {
    assert.equal(isAllowedMarketTitle(t), false, `expected dropped: ${t}`);
  }
});
