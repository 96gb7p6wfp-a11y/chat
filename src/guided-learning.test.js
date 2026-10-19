import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateLearningPhases, getGuidedSession, getLearningReviews, getTaskLearningMetadata, nextLearningReview, normalizeLearning, removeLearningAttempt, saveLearningAttempt } from './guided-learning.js';

const today = '2026-10-19';
const data = { subjects: [{ id: 'mathematics', name: 'Mathematics', weakTopics: [] }, { id: 'physics', name: 'Physics' }, { id: 'german', name: 'German' }, { id: 'english', name: 'English' }], profile: { englishLevel: 'B2' }, learning: { attempts: [] } };
const task = (subjectId, title, minutes = 40, extra = {}) => ({ id: `task-${subjectId}`, subjectId, title, minutes, date: today, category: 'academics', ...extra });
const record = (overrides = {}) => ({ id: 'attempt-1', taskId: 'task-1', subjectId: 'german', topic: 'de-analysis', questionId: 'de-analysis-paragraph', answer: 'Mein eigener Absatz.', date: today, rating: 'again', mistake: 'Beleg ohne Deutung.', ...overrides });

test('every phase budget fits the promised session, including five-minute and rest budgets', () => {
  for (const minutes of [0, 1, 5, 10, 25, 35, 40, 95, 180]) {
    const phases = allocateLearningPhases(minutes, [{ title: 'Recall', weight: 1 }, { title: 'Practice', weight: 4 }, { title: 'Check', weight: 2 }, { title: 'Record', weight: 1 }]);
    assert.equal(phases.reduce((sum, phase) => sum + phase.minutes, 0), minutes);
    assert.ok(phases.every(phase => Number.isInteger(phase.minutes) && phase.minutes > 0));
  }
  assert.deepEqual(allocateLearningPhases(0, []), []);
});

test('exponential practice has four checkable exercises and correct logarithmic solutions', () => {
  const session = getGuidedSession(data, task('mathematics', 'Exponentialfunktionen üben'), today);
  assert.equal(session.topic, 'math-exponential'); assert.equal(session.questions.length, 4);
  assert.match(session.questions[0].solution, /f\(0\) = 3; f\(3\) = 24/);
  assert.match(session.questions[1].solution, /2e/);
  assert.equal((2 * Math.log(5)).toFixed(2), '3.22'); assert.match(session.questions[2].solution, /3,22/);
  assert.equal((200 * Math.exp(.15 * 4)).toFixed(2), '364.42'); assert.match(session.questions[3].solution, /364,42/);
  assert.equal((Math.log(2) / .15).toFixed(2), '4.62'); assert.match(session.questions[3].solution, /4,62/);
  assert.deepEqual(session.phases.map(phase => phase.minutes), [5, 20, 10, 5]);
});

test('RC discharge uses SI units, a positive decay time and correct energy/current values', () => {
  const session = getGuidedSession(data, task('physics', 'RC circuit discharge', 35), today);
  assert.equal(session.topic, 'physics-rc'); assert.equal(session.questions.length, 3);
  const resistance = 100000, capacitance = .0001, initialVoltage = 12;
  const tau = resistance * capacitance;
  assert.equal(tau, 10); assert.match(session.questions[0].solution, /10 s/);
  assert.equal((initialVoltage * Math.exp(-10 / tau)).toFixed(2), '4.41'); assert.match(session.questions[0].solution, /4,41 V/);
  assert.equal((tau * Math.log(initialVoltage / 3)).toFixed(2), '13.86'); assert.match(session.questions[1].solution, /13,86 s/);
  assert.equal(.5 * capacitance * initialVoltage ** 2, .007200000000000001);
  assert.match(session.questions[2].solution, /7,2 mJ/); assert.match(session.questions[2].solution, /0,12 mA/);
});

test('short numerical practice reduces the quantity instead of promising four problems in five minutes', () => {
  const math = getGuidedSession(data, task('mathematics', 'Exponentialfunktionen', 5), today);
  assert.equal(math.questions.length, 1); assert.match(math.objective, /Eine Exponentialaufgabe/);
  const physics = getGuidedSession(data, task('physics', 'RC-Entladung', 15), today);
  assert.equal(physics.questions.length, 1); assert.match(physics.objective, /eine Aufgabe/);
  const charging = getGuidedSession(data, task('physics', 'RC-Kreis: Aufladen eines Kondensators', 35), today);
  assert.notEqual(charging.topic, 'physics-rc'); assert.equal(charging.provisional, true);
});

test('German analysis offers an original passage, usable scaffold, criteria and a qualified model answer', () => {
  const session = getGuidedSession(data, task('german', 'Strukturiertes Schreiben', 35), today);
  assert.equal(session.topic, 'de-analysis'); assert.ok(session.passage.length > 100);
  assert.match(session.materialLabel, /Eigener/); assert.match(session.template, /Beleg|„|…/);
  assert.ok(session.criteria.length >= 4); assert.match(session.sampleAnswer, /„kleiner als zuvor“/);
  assert.equal(session.phases.reduce((sum, phase) => sum + phase.minutes, 0), 35);
  const vocabulary = getGuidedSession(data, task('german', 'Wortschatz: 8 Wörter'), today);
  assert.ok(vocabulary.words.length > 0); assert.notEqual(vocabulary.topic, 'de-analysis');
});

test('unknown mathematics topic uses actual class material rather than inventing a matching syllabus', () => {
  const session = getGuidedSession(data, task('mathematics', 'Mein aktuelles schwaches Thema'), today);
  assert.equal(session.provisional, true); assert.equal(session.questions.length, 0);
  assert.match(session.firstStep, /aktuellen Unterricht/); assert.ok(!session.objective.includes('Exponential'));
  const differentiation = getGuidedSession(data, task('mathematics', 'Ableitungen üben'), today);
  assert.match(differentiation.questions[0].solution, /3x²/); assert.notEqual(differentiation.topic, 'math-exponential');
});

test('timed and light revision preserve the examination purpose rather than substituting an easy exercise bank', () => {
  const timed = getGuidedSession(data, task('mathematics', 'Exponentialfunktionen: Probeklausur', 90, { revisionStage: 'timed', examId: 'exam-1' }), today);
  assert.equal(timed.questions.length, 0); assert.equal(timed.phases.length, 1); assert.equal(timed.phases[0].minutes, 90);
  assert.match(timed.phases[0].action, /Fehlerauswertung als nächste Einheit/);
  const light = getGuidedSession(data, task('german', 'Letzte Wiederholung', 15, { revisionStage: 'light', examId: 'exam-2' }), today);
  assert.equal(light.questions.length, 0); assert.match(light.phases.at(-1).action, /Erholung/);
  const grammar = getGuidedSession(data, task('german', 'Konjunktiv I üben', 20), today);
  assert.equal(grammar.topic, 'de-grammar'); assert.equal(grammar.questions.length, 0); assert.equal(grammar.provisional, true);
});

test('application and profile tasks retain their actual action even if IELTS or a subject appears in the title', () => {
  const action = task('english', 'Prüfen, ob IELTS akzeptiert wird', 15, { category: 'university', roadmapStepId: 'english-policy', steps: ['Offizielle Anforderungen der Universität öffnen.', 'Eine verifizierte Anforderung notieren.'] });
  const session = getGuidedSession(data, action, today);
  assert.equal(session.objective, action.title); assert.equal(session.questions.length, 0);
  assert.equal(session.firstStep, action.steps[0]); assert.notEqual(session.topic, 'ielts-writing-task2');
  const english = getGuidedSession(data, task('english', 'Analyze a text about exponential growth in German industry'), today);
  assert.equal(english.topic, 'en-analysis'); assert.ok(english.passage); assert.notEqual(english.topic, 'math-exponential');
});

test('IELTS practice fits each skill, gives no proficiency score and adapts near the exam', () => {
  for (const skill of ['listening', 'reading', 'writing', 'speaking']) {
    const session = getGuidedSession(data, task('english', `IELTS ${skill}`, 25, { ieltsSkill: skill }), today);
    assert.equal(session.skill, skill); assert.equal(session.phases.reduce((sum, phase) => sum + phase.minutes, 0), 25);
    assert.ok(session.resources.every(resource => /^https:\/\//.test(resource.url))); assert.equal(session.band, undefined);
  }
  const shortWriting = getGuidedSession(data, task('english', 'IELTS Writing', 25, { ieltsSkill: 'writing' }), today);
  assert.match(shortWriting.objective, /Absatz/);
  const fullWriting = getGuidedSession(data, task('english', 'IELTS Writing', 45, { ieltsSkill: 'writing' }), today);
  assert.match(fullWriting.expectedResult, /250/); assert.equal(fullWriting.phases[0].minutes + fullWriting.phases[1].minutes, 40);
  const lastDay = getGuidedSession({ ...data, ielts: { examDate: '2026-10-20' } }, task('english', 'IELTS Writing', 45, { ieltsSkill: 'writing' }), today);
  assert.match(lastDay.objective, /ruhig wiederholen/); assert.equal(lastDay.questions.length, 0);
});

test('self-reported reflections persist as separate evidence and do not fabricate grades or task completion', () => {
  const original = { ...data, grades: [], tasks: [{ id: 'task-1', completed: false }] };
  const saved = saveLearningAttempt(original, record());
  assert.equal(original.learning.attempts.length, 0); assert.equal(saved.learning.attempts.length, 1);
  assert.deepEqual(saved.grades, []); assert.equal(saved.tasks[0].completed, false);
  assert.deepEqual(normalizeLearning(JSON.parse(JSON.stringify(saved.learning))), saved.learning);
  assert.equal(saved.learning.attempts[0].nextReviewDate, '2026-10-20');
  assert.throws(() => saveLearningAttempt(original, record({ rating: 'official-band-8' })), /Einschätzung/);
  assert.deepEqual(normalizeLearning({ attempts: [record({ date: '2026-02-30' })] }), { attempts: [] });
});

test('review intervals depend on the learner report and only the latest evidence remains due', () => {
  const good = record({ rating: 'good', date: '2026-10-10' });
  assert.equal(nextLearningReview([], good), '2026-10-14');
  assert.equal(nextLearningReview([{ ...good, id: 'older', date: '2026-10-05' }], good), '2026-10-17');
  assert.equal(nextLearningReview([{ ...good, id: 'older', date: '2026-10-05', rating: 'again' }], good), '2026-10-14');
  let state = saveLearningAttempt(data, record({ id: 'old', date: '2026-10-10' }));
  assert.equal(getLearningReviews(state, today).length, 1);
  state = saveLearningAttempt(state, record({ id: 'new', taskId: 'new-task', rating: 'good' }));
  assert.equal(getLearningReviews(state, today).length, 0);
  assert.equal(getLearningReviews(state, '2026-10-23').length, 1);
  state = removeLearningAttempt(state, 'new'); assert.equal(getLearningReviews(state, today).length, 1);
});

test('teacher feedback is suggested after repeated topic struggles, never one low result or repeated edits', () => {
  const german = task('german', 'Analyseabsatz schreiben', 35);
  let state = saveLearningAttempt(data, record({ id: 'one', taskId: 'one', date: '2026-10-14' }));
  assert.equal(getGuidedSession(state, german, today).helpRecommendation, '');
  state = saveLearningAttempt(state, record({ id: 'two', taskId: 'two', date: '2026-10-16', rating: 'hard' }));
  state = saveLearningAttempt(state, record({ id: 'three', taskId: 'three', date: '2026-10-18' }));
  assert.match(getGuidedSession(state, german, today).helpRecommendation, /mindestens drei Einheiten/);
  state = saveLearningAttempt(state, record({ id: 'improved', taskId: 'improved', rating: 'good' }));
  assert.equal(getGuidedSession(state, german, today).helpRecommendation, '');
});

test('planner metadata is concise and points at the same practice as the learning detail', () => {
  const item = task('physics', 'RC-Entladung', 35);
  const metadata = getTaskLearningMetadata(item, data, today), session = getGuidedSession(data, item, today);
  assert.deepEqual(metadata, { learningTopic: session.topic, objective: session.objective, expectedResult: session.expectedResult });
});
