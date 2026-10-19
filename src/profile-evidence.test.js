import test from 'node:test';
import assert from 'node:assert/strict';
import { getActivityEvidence, getProfileEvidence, getProfileRecommendations, safeEvidenceUrl } from './profile-evidence.js';
test('an explicit verified label without supporting evidence remains self-reported', () => {
  assert.equal(getActivityEvidence({ evidenceStatus: 'verified', evidence: [{ label: 'Certificate' }] }).status, 'self-reported');
  assert.equal(getActivityEvidence({ evidenceStatus: 'verified', evidence: [{ note: 'Certificate stored at home.' }] }).status, 'verified');
  assert.equal(getActivityEvidence({ evidence: [{ url: 'https://example.org' }] }).status, 'self-reported');
  assert.equal(getActivityEvidence({ evidenceStatus: 'planned', evidence: [{ note: 'A plan' }] }).status, 'planned');
});
test('only safe public web links are clickable', () => {
  assert.equal(safeEvidenceUrl('javascript:alert(1)'), null);
  assert.equal(safeEvidenceUrl('file:///private/report'), null);
  assert.equal(safeEvidenceUrl('https://github.com/example/project'), 'https://github.com/example/project');
});
test('empty profile has honest missing states without an admission percentage', () => {
  const sections = getProfileEvidence({});
  assert.equal(sections.length, 6);
  assert.ok(sections.every(section => section.count === 0));
  assert.ok(sections.every(section => !section.state.includes('%')));
});
test('project recommendations describe how to document existing work', () => {
  const data = { activities: [{ id: 'coding', name: 'Coding', type: 'Project', responsibilities: 'Built authentication', impact: 'Used by classmates' }] };
  const recommendations = getProfileRecommendations(data);
  assert.ok(recommendations.some(item => item.id === 'project-coding' && item.minutes === 20));
  assert.ok(recommendations.some(item => item.id === 'evidence-coding'));
  assert.ok(recommendations.every(item => item.why && item.how && item.benefit));
});
test('unknown grades do not trigger an invented weak-grade recommendation', () => {
  assert.equal(getProfileRecommendations({ subjects: [{ target: 10, written: null, oral: null }] }).some(item => item.id === 'academic-first'), false);
});
test('dated grades and planned projects remain distinct from achievements', () => {
  const sections = getProfileEvidence({ grades: [{ points: 12, date: '2026-10-19' }], activities: [{ type: 'Project', evidenceStatus: 'planned' }], ielts: { scores: [{ source: 'mock' }] } });
  assert.equal(sections.find(section => section.id === 'projects').state, 'Bisher geplant');
  assert.equal(sections.find(section => section.id === 'language').count, 0);
});
