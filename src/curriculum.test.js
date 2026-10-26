import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM_SOURCES, CURRICULUM_SUBJECTS, PROVIDED_CURRICULUM_TOPICS, getCurriculumTopics, getCurrentLearningTopics, normalizeCurriculum, removeCustomTopic, saveCustomTopic, setCurriculumSelection } from './curriculum.js';
const state = () => ({ profile: { schoolYear: 'Q1' }, curriculum: normalizeCurriculum(), grades: [{ id: 'real-grade', points: 4 }], subjects: [{ id: 'physics', level: 'LK', name: 'Physics' }], tasks: [{ id: 'actual-task' }] });

test('unverified user-provided catalogue never claims an official curriculum version or mandatory status', () => {
  assert.equal(CURRICULUM_SUBJECTS.length, 10);
  for (const topic of PROVIDED_CURRICULUM_TOPICS) {
    assert.equal(topic.origin, 'provided-pending-verification');
    assert.equal(topic.requirement, 'unknown');
    assert.equal(topic.curriculumVersion, null);
    assert.equal(topic.verifiedAt, null);
    assert.ok(topic.sourceUrl.startsWith('https://kultus.hessen.de/'));
  }
  for (const source of Object.values(CURRICULUM_SOURCES)) assert.equal(source.verifiedAt, null);
  assert.ok(!PROVIDED_CURRICULUM_TOPICS.some(item => /vanishing/i.test(item.title)), 'an unverified required text must not be seeded');
});

test('only supplied official codes are present and no fabricated subtopic codes are assigned', () => {
  assert.deepEqual(getCurriculumTopics(state(), 'mathematics', 'Q1').map(item => item.code), ['Q1.1', 'Q1.2', 'Q1.3']);
  assert.deepEqual(getCurriculumTopics(state(), 'mathematics', 'Q2').map(item => item.code), ['Q2.1', 'Q2.2', 'Q2.3']);
  assert.equal(getCurriculumTopics(state(), 'physics', 'Q1').find(item => item.title === 'Entladen').code, '');
  assert.equal(getCurriculumTopics(state(), 'english', 'Q1').some(item => item.code), false);
  assert.equal(getCurriculumTopics(state(), 'german', 'Q1').length, 0);
});

test('selected specific capacitor subtopic retains the actual hierarchy for tutor mapping', () => {
  const data = setCurriculumSelection(state(), 'provided-physics-q1-entladen', { status: 'practice', examRelevant: true });
  const current = getCurrentLearningTopics(data, 'physics');
  assert.equal(current.length, 1);
  assert.equal(current[0].learningTopic, 'Elektrisches Feld · Kondensator · Entladen');
  assert.equal(current[0].status, 'practice');
  assert.equal(current[0].examRelevant, true);
  assert.equal(current[0].requirement, 'unknown');
});

test('multiple active topics are preserved; understood topics leave practice unless exam-relevant', () => {
  let data = setCurriculumSelection(state(), 'provided-physics-q1-q1-1', { status: 'class' });
  data = setCurriculumSelection(data, 'provided-physics-q1-entladen', { status: 'practice' });
  assert.equal(data.curriculum.selections.length, 2, 'both selected states remain saved');
  assert.equal(getCurrentLearningTopics(data, 'physics').length, 1, 'active child takes planning precedence over its broad parent');
  assert.equal(getCurrentLearningTopics(data, 'physics')[0].title, 'Entladen');
  data = setCurriculumSelection(data, 'provided-physics-q1-entladen', { status: 'understood' });
  assert.equal(getCurrentLearningTopics(data, 'physics').length, 1);
  assert.equal(getCurrentLearningTopics(data, 'physics')[0].title, 'Elektrisches Feld', 'parent resumes when the child leaves active practice');
  data = setCurriculumSelection(data, 'provided-physics-q1-entladen', { examRelevant: true });
  assert.equal(getCurrentLearningTopics(data, 'physics')[0].title, 'Entladen');
});

test('Q1 and Q2 selections do not leak across semester or subject', () => {
  let data = setCurriculumSelection(state(), 'provided-mathematics-q1-q1-1', { status: 'practice' });
  data = setCurriculumSelection(data, 'provided-mathematics-q2-q2-3', { status: 'class' });
  assert.equal(getCurrentLearningTopics(data, 'mathematics').length, 1);
  assert.equal(getCurrentLearningTopics(data, 'mathematics', 'Q2')[0].title, 'Geraden und Ebenen im Raum');
  assert.equal(getCurrentLearningTopics(data, 'physics').length, 0);
});

test('custom teacher topic can be saved, edited, selected and removed without touching user grades', () => {
  const original = state();
  let data = saveCustomTopic(original, { id: 'teacher-classic', subjectId: 'german', semester: 'Q1', title: 'Weimarer Klassik', origin: 'teacher', note: 'Eigene Notiz' });
  data = setCurriculumSelection(data, 'teacher-classic', { status: 'class' });
  assert.equal(getCurrentLearningTopics(data, 'german')[0].origin, 'teacher');
  assert.equal(getCurrentLearningTopics(data, 'german')[0].sourceUrl, '');
  data = saveCustomTopic(data, { id: 'teacher-classic', subjectId: 'german', semester: 'Q1', title: 'Weimarer Klassik: Humanität', origin: 'teacher' });
  assert.equal(data.curriculum.customTopics.length, 1);
  assert.equal(getCurrentLearningTopics(data, 'german')[0].title, 'Weimarer Klassik: Humanität');
  data = removeCustomTopic(data, 'teacher-classic');
  assert.equal(getCurrentLearningTopics(data, 'german').length, 0);
  assert.deepEqual(data.grades, original.grades);
  assert.deepEqual(data.tasks, original.tasks);
});

test('custom child can extend supplied fields and survive parent removal as an independent topic', () => {
  let data = saveCustomTopic(state(), { id: 'parent', subjectId: 'physics', semester: 'Q1', title: 'Eigener Unterricht' });
  data = saveCustomTopic(data, { id: 'child', subjectId: 'physics', semester: 'Q1', title: 'RC-Entladung', parentId: 'parent' });
  data = setCurriculumSelection(data, 'child', { status: 'practice' });
  assert.deepEqual(getCurrentLearningTopics(data, 'physics')[0].path, ['Eigener Unterricht', 'RC-Entladung']);
  data = removeCustomTopic(data, 'parent');
  assert.deepEqual(getCurrentLearningTopics(data, 'physics')[0].path, ['RC-Entladung']);
});

test('normalization safely handles malformed values, duplicates, cross-subject selections and cyclic parents', () => {
  assert.deepEqual(normalizeCurriculum(null), { version: 1, selections: [], customTopics: [] });
  const normalized = normalizeCurriculum({ customTopics: [
    { id: 'a', subjectId: 'german', semester: 'Q1', title: 'A', parentId: 'b' },
    { id: 'b', subjectId: 'german', semester: 'Q1', title: 'B', parentId: 'a' },
    { id: 'a', subjectId: 'german', semester: 'Q1', title: 'duplicate' },
    { id: 'invalid', subjectId: 'german', semester: 'Q4', title: 'outside implemented catalogue' },
  ], selections: [
    { topicId: 'a', subjectId: 'physics', semester: 'Q1', status: 'class' },
    { topicId: 'a', subjectId: 'german', semester: 'Q1', status: 'class' },
    { topicId: 'a', subjectId: 'german', semester: 'Q1', status: 'practice' },
  ] });
  assert.equal(normalized.customTopics.length, 2);
  assert.equal(normalized.customTopics[0].parentId, '');
  assert.equal(normalized.selections.length, 1);
  assert.equal(normalized.selections[0].status, 'class');
  assert.deepEqual(normalizeCurriculum(normalized), normalized, 'normalization is stable');
});

test('user cannot turn a topic selection into a different subject or official topic', () => {
  const data = setCurriculumSelection(state(), 'provided-physics-q1-entladen', { status: 'practice', subjectId: 'german', topicId: 'fake' });
  assert.equal(data.curriculum.selections[0].subjectId, 'physics');
  assert.equal(data.curriculum.selections[0].topicId, 'provided-physics-q1-entladen');
  assert.throws(() => saveCustomTopic(data, { id: 'provided-physics-q1-entladen', subjectId: 'german', semester: 'Q1', title: 'fake' }), TypeError);
  assert.equal(setCurriculumSelection(data, 'unknown', { status: 'practice' }), data);
});

test('active sibling topics remain available without promoting their common parent', () => {
  let data = setCurriculumSelection(state(), 'provided-physics-q1-q1-1', { status: 'class' });
  data = setCurriculumSelection(data, 'provided-physics-q1-feldstaerke', { status: 'class' });
  data = setCurriculumSelection(data, 'provided-physics-q1-entladen', { status: 'practice' });
  assert.deepEqual(getCurrentLearningTopics(data, 'physics').map(item => item.title), ['Entladen', 'Elektrische Feldstärke']);
  assert.equal(data.curriculum.selections.length, 3);
});
