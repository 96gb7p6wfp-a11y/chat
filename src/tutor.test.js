import test from 'node:test';
import assert from 'node:assert/strict';
import { getTutorChoices, getTutorSession, normalizeTutorSessions, resolveTutorTopic } from './tutor.js';
import { getGuidedSession, getTaskLearningMetadata, getLearningReviews, saveLearningAttempt } from './guided-learning.js';

const TODAY = '2026-10-25';
const task = (patch = {}) => ({ id: 'today-task', date: TODAY, subjectId: 'english', category: 'language', title: 'Englisch lernen', minutes: 15, origin: 'generated', ...patch });
const data = () => ({ subjects: [{ id: 'english', name: 'English', enabled: true, weakTopics: [] }, { id: 'mathematics', name: 'Mathematics', enabled: true, weakTopics: [] }, { id: 'physics', name: 'Physics', enabled: true, weakTopics: [] }], exams: [], learning: { attempts: [], sessions: [] } });
const attempt = patch => ({ id: 'attempt', taskId: 'old-task', subjectId: 'english', topic: 'english-civil-rights-brown', questionId: 'brown-impact', answer: 'Meine wirkliche Antwort', date: '2026-10-24', rating: 'hard', mistake: 'Rechtliche Entscheidung und Umsetzung verwechselt.', nextReviewDate: '2026-10-26', ...patch });

test('every available unit contains actual explanation, question, solution and checking guidance', () => {
  const seen = new Set();
  for (const subjectId of ['english', 'german', 'mathematics', 'physics', 'ielts', 'sat']) {
    const choices = getTutorChoices(subjectId);
    assert.ok(choices.length > 0);
    for (const choice of choices) {
      const unit = getTutorSession(data(), task({ subjectId, category: 'academics', minutes: 30 }), TODAY, choice.id);
      assert.equal(unit.status, 'ready', choice.id);
      assert.ok(unit.explanation.length > 100, choice.id);
      assert.ok(unit.questions.length >= 1);
      assert.ok(unit.firstExercise.length > 20);
      assert.ok(unit.reviewPrompt.length > 20);
      for (const question of unit.questions) {
        assert.ok(question.prompt.length > 20 && question.solution.length > 0 && question.explanation.length > 20, question.id);
        assert.ok(!seen.has(question.id), `question IDs must remain unique when the user changes unit: ${question.id}`);
        seen.add(question.id);
      }
    }
  }
});

test('unknown examination topics require one topic choice rather than pretending a generic task is a lesson', () => {
  const state = data();
  state.exams = [{ id: 'exam', subjectId: 'english', topics: [] }];
  const unit = getTutorSession(state, task({ examId: 'exam', learningTopic: 'en-analysis', title: 'Recall important concepts', revisionStage: 'light' }), TODAY);
  assert.equal(unit.status, 'choose-topic');
  assert.equal(unit.questions.length, 0);
  assert.equal(unit.topicSelectionRequired, true);
  assert.ok(unit.choices.some(choice => choice.id === 'english-civil-rights-brown'));
  const chosen = getTutorSession(state, task({ examId: 'exam' }), TODAY, 'english-civil-rights-brown');
  assert.equal(chosen.status, 'ready');
  assert.equal(chosen.topicSource, 'selection');
  assert.match(chosen.topicNotice, /noch nicht bestätigt/);
  assert.deepEqual(state.exams[0].topics, [], 'practice choice never fabricates official exam topics');
});

test('actual exam topic outranks broad task labels and unrelated weak-topic suggestions', () => {
  const state = data();
  state.subjects[0].weakTopics = ['American Dream'];
  state.exams = [{ id: 'exam', subjectId: 'english', topics: ['Civil Rights'] }];
  const unit = getTutorSession(state, task({ examId: 'exam', learningTopic: 'en-analysis', title: 'English analysis' }), TODAY);
  assert.equal(unit.unitId, 'english-civil-rights-brown');
  assert.equal(unit.topicSource, 'exam');
  assert.match(unit.explanation, /1954/);
  assert.match(unit.explanation, /Fourteenth Amendment/);
  assert.match(unit.questions[2].solution, /resistance/);
});

test('multiple known exam areas remain a deliberate topic choice', () => {
  const state = data();
  state.exams = [{ id: 'exam', topics: ['Civil Rights', 'American Dream', 'analysis'] }];
  const unit = getTutorSession(state, task({ examId: 'exam' }), TODAY);
  assert.equal(unit.status, 'choose-topic');
  assert.equal(unit.choices[0].id, 'english-civil-rights-brown');
  assert.ok(unit.choices.some(choice => choice.id === 'english-american-dream'));
  const exact = getTutorSession(state, task({ examId: 'exam', learningTopic: 'english-american-dream' }), TODAY);
  assert.equal(exact.unitId, 'english-american-dream');
});

test('unsupported topics are honestly incomplete, with no substitute generic lesson', () => {
  const state = data();
  state.exams = [{ id: 'exam', topics: ['Analysis of Hamlet'] }];
  const unit = getTutorSession(state, task({ examId: 'exam', title: 'Analysis paragraph' }), TODAY);
  assert.equal(unit.status, 'unsupported');
  assert.equal(unit.questions.length, 0);
  assert.match(unit.unavailableReason, /Hamlet/);
  assert.ok(unit.choices.length);
  assert.equal(getTutorSession(state, task(), TODAY, 'Analysis of Hamlet').status, 'unsupported');
  assert.equal(getTutorSession(state, task({ subjectId: 'history', category: 'academics' }), TODAY).status, 'unsupported');
});

test('charging is never replaced by an RC discharge worksheet and unsupported advanced topics stay unsupported', () => {
  for (const topic of ['Aufladung eines Kondensators', 'RC circuit charging', 'Kondensatoren in Parallelschaltung']) assert.equal(resolveTutorTopic('physics', topic), null, topic);
  assert.equal(resolveTutorTopic('physics', 'RC-Entladung').id, 'physics-rc-discharge');
  for (const topic of ['Lorentzkraft', 'Magnetische Kräfte', 'Coulomb-Kraft', 'Elektrische Kraft', 'Newtons Gravitationsgesetz', 'Auftriebskraft', 'Federkraft']) assert.equal(resolveTutorTopic('physics', topic), null, topic);
  const state = data(); state.exams = [{ id: 'lorentz', topics: ['Lorentzkraft'] }];
  assert.equal(getTutorSession(state, task({ subjectId: 'physics', category: 'academics', examId: 'lorentz' }), TODAY).status, 'unsupported');
  assert.equal(getTutorSession(state, task({ subjectId: 'physics', category: 'academics', examId: 'lorentz' }), TODAY, 'physics-forces').status, 'ready', 'an explicit foundational-module choice remains available without pretending it is the Lorentz syllabus');
  for (const topic of ['Partielle Integration', 'Integration durch Substitution', 'Logistisches Wachstum']) assert.equal(resolveTutorTopic('mathematics', topic), null, topic);
});

test('authored numerical exercises contain checked exact results and explanatory follow-up problems', () => {
  const integration = getTutorSession(data(), task({ subjectId: 'mathematics', minutes: 30 }), TODAY, 'mathematics-integration');
  assert.match(integration.questions[0].solution, /x³ − 2x² \+ 2x \+ C/);
  assert.match(integration.questions[1].solution, /8\/3/);
  assert.match(integration.questions[2].solution, /Integral ist 0/);
  assert.match(integration.questions[2].solution, /Flächeninhalt ist 1/);
  const physics = getTutorSession(data(), task({ subjectId: 'physics', minutes: 30 }), TODAY, 'physics-rc-discharge');
  assert.match(physics.questions[0].solution, /10 s/);
  assert.match(physics.questions[0].solution, /4,41 V/);
  assert.match(physics.questions[1].solution, /13,86 s/);
  assert.match(physics.questions[2].solution, /7,2 mJ/);
  assert.ok(physics.questions.every(question => question.followUp || question.criteria?.length));
});

test('short sessions have concrete questions and phase time never exceeds their actual duration', () => {
  for (const minutes of [0, 1, 5, 10, 12, 15, 25, 45, 120]) {
    const unit = getTutorSession(data(), task({ subjectId: 'mathematics', minutes }), TODAY, 'mathematics-exponential');
    assert.equal(unit.phases.reduce((sum, phase) => sum + phase.minutes, 0), minutes);
    assert.ok(unit.questions.length >= 1);
    assert.ok(minutes >= 10 || unit.questions.length === 1);
  }
  assert.deepEqual(getTutorSession(data(), task(), TODAY, 'english-civil-rights-brown').phases.map(phase => phase.minutes), [3, 7, 3, 2]);
});

test('Brown source is attached only to the history module, while language practice uses relevant sources', () => {
  const brown = getTutorSession(data(), task(), TODAY, 'english-civil-rights-brown');
  const comment = getTutorSession(data(), task(), TODAY, 'english-comment-argument');
  assert.ok(brown.resources.some(source => /archives.gov/.test(source.url)));
  assert.ok(!comment.resources.some(source => /archives.gov/.test(source.url)));
});

test('IELTS reading, listening, speaking and writing provide actual material while preserving assessment limits', () => {
  for (const skill of ['reading', 'listening', 'speaking', 'writing']) {
    const unit = getTutorSession(data(), task({ ieltsSkill: skill }), TODAY);
    assert.equal(unit.status, 'ready');
    assert.ok(unit.questions.length >= 1);
    assert.match(unit.assessmentNote, /keine automatische/);
    if (skill === 'listening') {
      assert.equal(unit.requiresAudio, true);
      assert.ok(unit.audioText.length > 100);
      assert.ok(!unit.explanation.includes(unit.audioText));
      assert.match(unit.questions[0].solution, /10:15/);
    }
    if (skill === 'reading') assert.equal(unit.questions[1].solution.startsWith('Not Given'), true);
  }
  const full = getTutorSession(data(), task({ satSkill: 'full', minutes: 144 }), TODAY);
  assert.equal(full.status, 'external');
  assert.match(full.resources[0].url, /bluebook/);
  assert.equal(full.questions.length, 0);
});

test('hard question evidence is prioritised before short-session truncation and future evidence is ignored', () => {
  const state = data();
  state.learning.attempts = [attempt(), attempt({ id: 'future', date: '2026-10-26', rating: 'good', questionId: 'brown-decision', mistake: '' })];
  const unit = getTutorSession(state, task({ minutes: 5, learningTopic: 'english-civil-rights-brown' }), TODAY);
  assert.equal(unit.questions[0].id, 'brown-impact');
  assert.match(unit.previousMistake, /Umsetzung/);
  assert.equal(unit.latestAttempt.id, 'attempt');
  assert.equal(unit.helpRecommendation, '');
});

test('learning review and planner metadata keep the exact authored unit instead of reverting to generic analysis', () => {
  let state = data();
  state = saveLearningAttempt(state, attempt({ date: '2026-10-23', rating: 'hard' }));
  const due = getLearningReviews(state, TODAY)[0];
  assert.equal(due.topic, 'english-civil-rights-brown');
  const reviewTask = task({ learningTopic: due.topic, minutes: 10 });
  const metadata = getTaskLearningMetadata(reviewTask, state, TODAY);
  assert.equal(metadata.learningTopic, 'english-civil-rights-brown');
  assert.match(metadata.objective, /1954/);
  assert.equal(getGuidedSession(state, reviewTask, TODAY).tutor.questions[0].id, 'brown-impact');
});

test('teacher support requires repeated actual uncertainty and does not infer a weakness from one grade', () => {
  const state = data();
  state.grades = [{ points: 4, subjectId: 'english' }];
  let unit = getTutorSession(state, task(), TODAY, 'english-civil-rights-brown');
  assert.equal(unit.helpRecommendation, '');
  state.learning.attempts = [attempt({ id: 'a', taskId: 'a', date: '2026-10-21' }), attempt({ id: 'b', taskId: 'b', date: '2026-10-22' }), attempt({ id: 'c', taskId: 'c', date: '2026-10-24' })];
  unit = getTutorSession(state, task(), TODAY, 'english-civil-rights-brown');
  assert.match(unit.helpRecommendation, /Lehrkraft/);
  state.learning.attempts.push(attempt({ id: 'd', taskId: 'd', date: TODAY, rating: 'good', mistake: '' }));
  assert.equal(getTutorSession(state, task(), TODAY, 'english-civil-rights-brown').helpRecommendation, '');
});

test('saved stepwise sessions preserve answers, review drafts, checks and timestamps without completing the task', () => {
  const input = [{ id: 'task-a', taskId: 'task-a', unitId: 'english-civil-rights-brown', stage: 'review', questionIndex: 2, answers: { 'brown-decision': '  My answer\nwith actual whitespace.  ' }, reviewAnswers: { 'brown-decision': 'Improved answer' }, revealed: ['brown-decision'], checks: { 'brown-decision': 'hard' }, mistakes: { 'brown-decision': 'Decision versus implementation' }, startedAt: '2026-10-25T08:00:00Z', completedAt: null, updatedAt: '2026-10-25T08:06:00Z' }];
  const normalized = normalizeTutorSessions(input);
  assert.deepEqual(normalized, input);
  const state = data(); state.learning.sessions = input;
  assert.equal(getTutorSession(state, task({ id: 'task-a' }), TODAY).unitId, 'english-civil-rights-brown');
  assert.equal(state.learning.sessions[0].completedAt, null);
  assert.equal(state.tasks, undefined);
});

test('a deliberate topic session never changes to a different active subject topic', () => {
  const data = { profile: { schoolYear: 'Q1' }, subjects: [{ id: 'physics', name: 'Physics' }], curriculum: { selections: [{ id: 'qa-current', subjectId: 'physics', semester: 'Q1', topicId: 'provided-physics-q1-entladen', status: 'class', examRelevant: false }], customTopics: [] } };
  const result = getTutorSession(data, { id: 'topic-2026-10-26-magnetic', origin: 'custom', subjectId: 'physics', category: 'academics', learningTopic: 'Magnetisches Feld', title: 'Physik · Magnetisches Feld', minutes: 20 }, '2026-10-26');
  assert.equal(result.status, 'unsupported');
  assert.equal(result.unitId, '');
});
