import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_REFERENCES, PROVIDER_VERIFIED_AT, getPublishedProviderDates } from './provider-references.js';

test('official provider snapshots retain source, scope and verification for every fact', () => {
  for (const provider of Object.values(PROVIDER_REFERENCES)) {
    for (const item of provider.facts) {
      assert.equal(item.verifiedAt, PROVIDER_VERIFIED_AT);
      assert.ok(new URL(item.url).protocol === 'https:');
      assert.ok(Number.isInteger(item.referenceYear));
      assert.ok(item.label && item.text.length > 30 && item.status);
    }
  }
});
test('only actually published 2026/27 SAT dates are confirmed, never seats or a booking', () => {
  const dates = PROVIDER_REFERENCES.sat.dates;
  assert.equal(dates.length, 5);
  assert.equal(new Set(dates.map(item => item.date)).size, 5);
  assert.deepEqual(dates[1], { id: 'college-board-2026-12-05', date: '2026-12-05', deadline: '2026-11-20', lateDeadline: '2026-11-24', sourceUrl: 'https://satsuite.collegeboard.org/sat/dates-deadlines', verifiedAt: '2026-10-26', referenceYear: 2026, status: 'confirmed', availability: 'not-checked' });
  assert.ok(dates.every(item => item.deadline < item.date && item.lateDeadline < item.date && item.deadline < item.lateDeadline && !item.date.startsWith('2028')));
  assert.equal(PROVIDER_REFERENCES.ielts.dates.length, 0);
});
test('expired registration is excluded and late-only dates are labelled honestly', () => {
  assert.equal(getPublishedProviderDates('sat', '2026-10-26')[0].registration, 'late-only');
  assert.equal(getPublishedProviderDates('sat', '2026-10-28')[0].date, '2026-12-05');
  assert.equal(getPublishedProviderDates('sat', '2027-05-26').length, 0);
  assert.deepEqual(getPublishedProviderDates('ielts', '2026-10-26'), []);
  assert.deepEqual(getPublishedProviderDates('sat', null), []);
  assert.deepEqual(getPublishedProviderDates('sat', '2026-02-30'), []);
});
test('fees and missing IELTS information are distinguished from unsupported promises', () => {
  assert.match(PROVIDER_REFERENCES.sat.facts.find(item => item.label === 'Kosten außerhalb der USA').text, /111 USD/);
  assert.equal(PROVIDER_REFERENCES.sat.facts.find(item => item.referenceYear === 2028).status, 'provisional');
  assert.equal(PROVIDER_REFERENCES.ielts.facts.find(item => item.label === 'Kosten & konkrete Termine').status, 'unverified');
});
