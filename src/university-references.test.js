import test from 'node:test';
import assert from 'node:assert/strict';
import { getOfficialUniversityReference } from './university-references.js';

test('UCL uses checked 2027 Computer Science references without pretending they are confirmed 2028 requirements', () => {
  const reference = getOfficialUniversityReference('ucl');
  assert.equal(reference.referenceYear, 2027);
  assert.equal(reference.programme, 'Computer Science BSc');
  assert.equal(reference.programmeSpecific, true);
  assert.equal(reference.status, 'provisional');
  assert.equal(reference.facts.find(item => item.kind === 'qualification').maxAbiturGrade, 1.4);
  assert.equal(reference.facts.find(item => item.kind === 'subject').minPoints, 14);
  assert.equal(reference.facts.find(item => item.kind === 'subject').evidenceScope, 'unknown');
  assert.match(reference.facts.find(item => item.kind === 'admissions-test').text, /TARA/);
  assert.equal(reference.facts.find(item => item.kind === 'english').minimumBand, 6.5);
  assert.equal(reference.facts.find(item => item.kind === 'deadline').referenceDeadline, '2027-01-13');
  assert.ok(reference.facts.every(item => item.status === 'provisional' && !item.deadlineDate && !item.entryYear));
});

test('UCLA is distinct from UCL and its competitive IELTS recommendation is not a minimum', () => {
  const reference = getOfficialUniversityReference('ucla');
  assert.equal(reference.programmeSpecific, false);
  assert.equal(reference.referenceYear, null);
  assert.equal(reference.facts.find(item => item.kind === 'sat').testPolicy, 'not-used');
  const english = reference.facts.find(item => item.kind === 'english');
  assert.equal(english.recommendedBand, 7.5);
  assert.equal(english.minimumBand, undefined);
});

test('Berkeley current institutional test policy stays a provisional reference, not a programme admission promise', () => {
  const reference = getOfficialUniversityReference('berkeley');
  assert.equal(reference.status, 'provisional');
  assert.equal(reference.facts.find(item => item.kind === 'sat').testPolicy, 'not-used');
  assert.match(reference.facts.find(item => item.kind === 'documents').text, /Einladung/);
  assert.equal(reference.facts.find(item => item.kind === 'english').minimumBand, 6.5);
});

test('references are independent fresh copies and unknown universities stay unknown', () => {
  const modified = getOfficialUniversityReference('ucl');
  modified.facts[0].maxAbiturGrade = 1;
  assert.equal(getOfficialUniversityReference('ucl').facts[0].maxAbiturGrade, 1.4);
  assert.equal(getOfficialUniversityReference('custom'), null);
  for (const institution of ['ucl', 'ucla', 'berkeley']) {
    const reference = getOfficialUniversityReference(institution);
    for (const item of reference.facts) {
      assert.equal(item.verifiedAt, '2026-10-26');
      assert.ok(item.sourceUrl.startsWith('https://'));
    }
  }
});
