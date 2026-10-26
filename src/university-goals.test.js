import test from 'node:test';
import assert from 'node:assert/strict';
import { createUniversityGoal, normalizeUniversityGoals, normalizeUniversityRequirement, saveUniversityGoal, removeUniversityGoal, saveUniversityRequirement, getRequirementReliability, compareUniversityRequirement, getUniversityGoalSummary, getSATRelevance, getUniversitySubjectBoost, getVerifiedUniversityAbiturTarget, getUniversityGoalDeadlines, getUniversityGoalCandidates } from './university-goals.js';

const TODAY = '2026-10-26';
const goal = (id = 'ucl', options = {}) => createUniversityGoal(id, { id: `qa-${id}`, ...options });
const state = goals => ({ universityGoals: { version: 1, goals }, subjects: [{ id: 'mathematics', name: 'Mathematics', target: 13, baselineWritten: 8.5 }, { id: 'english', name: 'English', target: 10 }], grades: [], profile: { schoolYear: 'Q1' }, hessen: { semesterResults: [], examinationSubjects: [] } });
function confirmed(target, kind, patch = {}) {
  return normalizeUniversityRequirement({ ...target.requirements.find(item => item.kind === kind), status: 'confirmed', entryYear: target.entryYear, referenceYear: target.entryYear, verifiedAt: TODAY, sourceInstitution: target.name, sourceProgramme: target.programme, manualChecked: true, manualNote: 'Isolierter QA-Quellenvermerk, keine tatsächliche Hochschulanforderung.', ...patch });
}

test('empty goals stay empty and do not alter the older university shortlist', () => {
  assert.deepEqual(normalizeUniversityGoals(), { version: 1, goals: [] });
  const existing = { universities: [{ id: 'old-ucla', name: 'Existing UCLA' }] };
  const next = saveUniversityGoal(existing, goal());
  assert.deepEqual(next.universities, existing.universities);
  assert.equal(getUniversityGoalSummary(state([]), TODAY).nextAction.type, 'goal-setup');
});

test('UCL and UCLA are distinct with no invented UCL test, grades, cost or deadline', () => {
  const ucl = goal(), ucla = goal('ucla');
  assert.equal(ucl.country, 'UK'); assert.equal(ucla.country, 'USA');
  assert.notEqual(ucl.name, ucla.name);
  assert.match(ucl.sourceUrl, /ucl\.ac\.uk/); assert.match(ucla.sourceUrl, /ucla\.edu/);
  assert.ok(ucl.requirements.every(item => item.status === 'provisional' && !item.verifiedAt));
  assert.ok(ucl.requirements.every(item => item.minPoints === null && item.maxAbiturGrade === null && item.minimumBand === null && !item.deadlineDate));
  assert.equal(ucl.requirements.find(item => item.kind === 'sat').testPolicy, 'unknown');
});

test('normalization is idempotent and malformed numeric and source values remain unknown', () => {
  const normalized = normalizeUniversityGoals({ goals: [goal()] });
  assert.deepEqual(normalizeUniversityGoals(normalized), normalized);
  const invalid = normalizeUniversityRequirement({ id: 'qa-invalid', minPoints: true, maxAbiturGrade: 0, minimumBand: 99, sourceUrl: 'javascript:alert(1)', deadlineDate: '2026-02-30' });
  assert.equal(invalid.minPoints, null); assert.equal(invalid.maxAbiturGrade, null); assert.equal(invalid.minimumBand, null); assert.equal(invalid.sourceUrl, ''); assert.equal(invalid.deadlineDate, '');
});

test('a checkbox, source URL and requested confirmed label alone cannot confirm requirements', () => {
  const ucl = goal();
  const unchecked = { ...ucl.requirements[0], status: 'confirmed', manualChecked: true };
  assert.equal(getRequirementReliability(ucl, unchecked, TODAY).confirmed, false);
  assert.throws(() => saveUniversityRequirement(state([ucl]), ucl.id, unchecked, TODAY), /Bestätigung fehlen/);
});

test('2027 references never become confirmed 2028 requirements', () => {
  const ucl = goal(), requirement = confirmed(ucl, 'overall', { referenceYear: 2027, maxAbiturGrade: 1.3 });
  assert.equal(getRequirementReliability(ucl, requirement, TODAY).status, 'provisional');
  assert.match(getRequirementReliability(ucl, requirement, TODAY).reason, /2027/);
  assert.equal(getVerifiedUniversityAbiturTarget(state([{ ...ucl, requirements: [requirement] }]), TODAY), null);
});

test('official host, matching programme and nonfuture check date are required', () => {
  const ucl = goal(), requirement = confirmed(ucl, 'subject', { subjectId: 'mathematics', minPoints: 12 });
  assert.equal(getRequirementReliability(ucl, requirement, TODAY).confirmed, true);
  assert.equal(getRequirementReliability(ucl, { ...requirement, sourceUrl: 'https://ucl.ac.uk.example.org/' }, TODAY).confirmed, false);
  assert.equal(getRequirementReliability(ucl, { ...requirement, sourceProgramme: 'Other programme' }, TODAY).confirmed, false);
  assert.equal(getRequirementReliability(ucl, { ...requirement, verifiedAt: '2026-10-27' }, TODAY).confirmed, false);
});

test('a subject threshold needs its exact evidence scope; one Q1 grade is not a final exam result', () => {
  const ucl = goal(); let data = state([ucl]);
  data.hessen.semesterResults = [{ subjectId: 'mathematics', semester: 'Q1', status: 'confirmed', points: 14 }];
  const requirement = confirmed(ucl, 'subject', { subjectId: 'mathematics', minPoints: 12 });
  assert.equal(compareUniversityRequirement(data, ucl, requirement, TODAY).status, 'not-assessed');
  assert.equal(compareUniversityRequirement(data, ucl, { ...requirement, evidenceScope: 'abitur-exam' }, TODAY).status, 'not-assessed');
  assert.equal(compareUniversityRequirement(data, ucl, { ...requirement, evidenceScope: 'semester', semester: 'Q1' }, TODAY).status, 'met');
  assert.equal(compareUniversityRequirement(data, ucl, { ...requirement, evidenceScope: 'semester', semester: 'Q2' }, TODAY).status, 'not-assessed');
});

test('starting estimates, individual grades and scenarios do not meet a confirmed semester requirement', () => {
  const ucl = goal(), requirement = confirmed(ucl, 'subject', { subjectId: 'mathematics', minPoints: 12, evidenceScope: 'semester', semester: 'Q1' });
  const data = state([ucl]); data.grades = [{ id: 'qa-grade', subjectId: 'mathematics', points: 15, type: 'written', date: TODAY, semester: 'Q1' }];
  data.hessen.semesterResults = [{ subjectId: 'mathematics', semester: 'Q1', points: 15, status: 'scenario' }];
  assert.equal(compareUniversityRequirement(data, ucl, requirement, TODAY).status, 'not-assessed');
  data.hessen.semesterResults[0].status = 'confirmed';
  assert.equal(compareUniversityRequirement(data, ucl, requirement, TODAY).status, 'met');
});

test('a confirmed English requirement gap recommends English rather than mathematics', () => {
  const ucl = goal(), requirement = confirmed(ucl, 'english', { minimumBand: 7 });
  const data = state([{ ...ucl, requirements: [requirement] }]);
  data.ielts = { scores: [{ source: 'official', date: TODAY, overall: 6.5 }] };
  const summary = getUniversityGoalSummary(data, TODAY);
  assert.equal(summary.nextAction.subjectId, 'english'); assert.match(summary.nextAction.title, /Englisch/);
  assert.equal(summary.primary.comparisons[0].status, 'improvement-needed');
});

test('only official IELTS results support a programme band comparison', () => {
  const ucl = goal(), requirement = confirmed(ucl, 'english', { minimumBand: 7 });
  const data = state([ucl]); data.ielts = { scores: [{ source: 'mock', date: TODAY, overall: 8 }] };
  assert.equal(compareUniversityRequirement(data, ucl, requirement, TODAY).status, 'not-assessed');
  data.ielts.scores = [{ source: 'official', date: '2026-10-27', overall: 8 }];
  assert.equal(compareUniversityRequirement(data, ucl, requirement, TODAY).status, 'not-assessed');
});

test('SAT is not recommended merely for UC prestige or an unknown UCL policy', () => {
  const uc = getSATRelevance(state([goal('ucla'), goal('berkeley')]), TODAY);
  assert.equal(uc.decision, 'not-needed'); assert.equal(uc.recommendPreparation, false); assert.equal(uc.needsVerification, true);
  assert.ok(uc.items.every(item => item.provisional));
  const mixed = getSATRelevance(state([goal(), goal('ucla')]), TODAY);
  assert.equal(mixed.decision, 'verify'); assert.equal(mixed.recommendPreparation, false);
});

test('SAT preparation requires a confirmed matching-year need; programme policies stay separate', () => {
  const ucl = goal(), sat = confirmed(ucl, 'sat', { testPolicy: 'required' });
  const data = state([{ ...ucl, requirements: [sat] }, goal('ucla')]);
  assert.equal(getSATRelevance(data, TODAY).recommendPreparation, true);
  sat.referenceYear = 2027;
  assert.equal(getSATRelevance(data, TODAY).recommendPreparation, false);
});

test('CS mathematics relevance is explainable and does not invent a university prerequisite', () => {
  const data = state([goal('ucl', { priority: 'high' })]);
  const boost = getUniversitySubjectBoost(data, 'mathematics', TODAY);
  assert.equal(boost.boost, 8); assert.equal(boost.targetPoints, null); assert.match(boost.reason, /noch nicht bestätigt/);
  assert.equal(getUniversitySubjectBoost(data, 'german', TODAY).boost, 0);
});

test('an own target gap creates an academic action without claiming an admission gap', () => {
  const data = state([goal()]);
  assert.equal(getUniversityGoalSummary(data, TODAY).nextAction.type, 'requirements', 'baseline8.5 is insufficient evidence');
  data.grades = [{ id: 'qa-actual', subjectId: 'mathematics', points: 8, type: 'written', date: TODAY, semester: 'Q1' }];
  const summary = getUniversityGoalSummary(data, TODAY);
  assert.equal(summary.nextAction.type, 'academic'); assert.match(summary.nextAction.why, /eigenen Fachziel/); assert.match(summary.nextAction.why, /keine bestätigte Zulassungslücke/);
});

test('verified university Abitur thresholds are offered explicitly without changing the selected goal', () => {
  const ucl = goal(), overall = confirmed(ucl, 'overall', { maxAbiturGrade: 1.3 });
  const data = state([{ ...ucl, requirements: [overall] }]); data.hessen.targetPoints = 700;
  const target = getVerifiedUniversityAbiturTarget(data, TODAY);
  assert.equal(target.grade, 1.3); assert.equal(target.entryYear, 2028); assert.match(target.sourceUrl, /ucl\.ac\.uk/);
  assert.equal(data.hessen.targetPoints, 700);
});

test('deadlines are structured and only confirmed matching-year dates affect urgency', () => {
  const ucl = goal(), requirement = confirmed(ucl, 'deadline', { deadlineDate: '2027-10-15' });
  const data = state([{ ...ucl, requirements: [requirement, ...ucl.requirements.filter(item => item.kind !== 'deadline')] }]);
  const dates = getUniversityGoalDeadlines(data, '2027-10-10');
  assert.equal(dates.length, 1); assert.equal(dates[0].daysUntil, 5);
  const candidates = getUniversityGoalCandidates(data, '2027-10-10');
  assert.equal(candidates[0].score, 150); assert.equal(candidates[0].priority, 'high');
  requirement.status = 'provisional';
  assert.equal(getUniversityGoalDeadlines(state([{ ...ucl, requirements: [requirement] }]), '2027-10-10').length, 0);
});

test('duplicate goals are rejected, deletion is scoped, and custom programmes get editable requirement slots', () => {
  const original = state([goal()]);
  assert.throws(() => saveUniversityGoal(original, goal('ucl', { id: 'another-id' })), /bereits gespeichert/);
  const custom = createUniversityGoal('custom', { id: 'qa-custom', name: 'Eigene Hochschule', programme: 'Wirtschaftsinformatik', sourceUrl: 'https://example.edu/programme' });
  assert.equal(custom.requirements.length, 11);
  const next = saveUniversityGoal(original, custom);
  assert.equal(next.universityGoals.goals.length, 2);
  assert.equal(removeUniversityGoal(next, 'qa-custom').universityGoals.goals.length, 1);
  assert.equal(original.universityGoals.goals.length, 1);
});

test('an urgent secondary programme deadline keeps that programme and its official source', () => {
  const ucl = goal('ucl', { priority: 'high' }), berkeley = goal('berkeley');
  const requirement = confirmed(berkeley, 'deadline', { deadlineDate: '2027-10-15' });
  berkeley.requirements = [requirement];
  const data = state([ucl, berkeley]);
  const candidate = getUniversityGoalCandidates(data, '2027-10-10')[0];
  assert.match(candidate.title, /UC Berkeley/); assert.match(candidate.resource, /berkeley\.edu/);
  assert.equal(getUniversityGoalDeadlines(data, '2027-10-10')[0].goalId, berkeley.id);
});
