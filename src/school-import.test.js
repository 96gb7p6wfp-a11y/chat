import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalProfile, getAvailability, getDailyPlan, getExamPlan, normalizeData, saveExam } from './coach.js';
import { serializeBackup, parseBackup } from './storage.js';
import { lessonsForDate, normalizeLessons } from './timetable.js';
import { SCHOOL_IMPORT_ID, CONFIRMED_Q1_EXAMS, Q1_TIMETABLE_DRAFT, applyExamImport, applyTimetableImport, confirmGermanGradeDraft, hasGermanFourResult, previewExamImport, previewTimetableImport } from './school-import.js';

const fresh = () => createPersonalProfile({ today: '2026-10-19' });
const details = (patch = {}) => ({ type: 'written', date: '2026-10-15', weight: 1, semester: 'Q1', confirmed: true, ...patch });

test('document pack contains exactly the nine personally confirmed dates, no times, rooms or invented topics', () => {
  assert.deepEqual(CONFIRMED_Q1_EXAMS.map(exam => [exam.subjectId, exam.date, exam.level]), [
    ['english', '2026-10-26', 'GK'], ['computer-science', '2026-11-12', 'GK'], ['politics', '2026-11-13', 'GK'], ['history', '2026-11-20', 'GK'], ['religion', '2026-11-25', 'GK'], ['physics', '2026-12-07', 'LK'], ['german', '2026-12-09', 'GK'], ['art', '2026-12-16', 'GK'], ['mathematics', '2026-12-17', 'LK'],
  ]);
  assert.ok(CONFIRMED_Q1_EXAMS.every(exam => exam.time === '' && exam.room === '' && exam.topics.length === 0 && exam.target === null));
  assert.equal(fresh().exams.length, 0, 'the pack is not silently seeded as a saved personal record');
});

test('exam import is idempotent and preserves an edited imported date and notes', () => {
  const base = fresh();
  const imported = applyExamImport(base);
  assert.equal(imported.exams.length, 9);
  assert.equal(base.exams.length, 0);
  const changed = saveExam(imported, { ...imported.exams[0], date: '2026-10-28', notes: 'Confirmed change from teacher', topics: ['American Dream'], room: 'My room' });
  const result = applyExamImport(normalizeData(changed, '2026-10-19'));
  assert.equal(result.exams.length, 9);
  assert.equal(result.exams[0].date, '2026-10-28');
  assert.equal(result.exams[0].notes, 'Confirmed change from teacher');
  assert.deepEqual(result.exams[0].topics, ['American Dream']);
  assert.equal(result.exams[0].room, 'My room');
});

test('matching pre-existing exam is tagged without overwriting its details and remains matched after editing', () => {
  const data = fresh();
  data.exams = [{ ...CONFIRMED_Q1_EXAMS[0], id: 'my-personal-exam', importKey: undefined, title: 'My English assessment', topics: ['Actual topic'], time: '10:00' }];
  const once = applyExamImport(data);
  assert.equal(once.exams.length, 9);
  assert.equal(once.exams[0].id, 'my-personal-exam');
  assert.equal(once.exams[0].title, 'My English assessment');
  assert.equal(once.exams[0].time, '10:00');
  once.exams[0] = { ...once.exams[0], date: '2026-10-29' };
  assert.equal(applyExamImport(normalizeData(once)).exams.length, 9);
});

test('missing subjects are flagged rather than manufacturing a subject or invalid exam link', () => {
  const data = { ...fresh(), subjects: [] };
  assert.ok(previewExamImport(data).every(item => item.status === 'missing-subject'));
  assert.equal(applyExamImport(data).exams.length, 0);
  assert.ok(previewTimetableImport(data).every(item => item.status === 'missing-subject'));
  assert.equal(applyTimetableImport(data).schedule.lessons.length, 0);
});

test('timetable extraction preserves 19 blocks, exact rooms, single and double periods and the PF course code', () => {
  assert.equal(Q1_TIMETABLE_DRAFT.length, 19);
  const data = applyTimetableImport(fresh());
  assert.equal(data.schedule.lessons.length, 19);
  assert.equal(data.schedule.lessons.filter(lesson => lesson.periodEnd > lesson.periodStart).length, 14);
  const tuesday = lessonsForDate(data, '2026-10-20');
  assert.equal(tuesday.length, 4);
  assert.deepEqual([tuesday[3].courseCode, tuesday[3].courseType, tuesday[3].start, tuesday[3].end, tuesday[3].room], ['SPO-PF-1', 'PF', '15:00', '15:45', '']);
  const friday = lessonsForDate(data, '2026-10-23');
  assert.equal(friday.length, 6);
  assert.deepEqual([friday.at(-1).start, friday.at(-1).end, friday.at(-1).room], ['15:00', '16:30', 'TMBG']);
  const wednesdayEnglish = lessonsForDate(data, '2026-10-21').find(lesson => lesson.subjectId === 'english');
  assert.deepEqual([wednesdayEnglish.start, wednesdayEnglish.end, wednesdayEnglish.periodStart, wednesdayEnglish.periodEnd], ['11:45', '13:10', 5, 6]);
  assert.ok(data.schedule.lessons.every(lesson => lesson.cycle === 'all'));
});

test('timetable import merges exact user lessons, preserves corrections on repetition and never duplicates blocks', () => {
  const data = fresh();
  data.schedule.lessons = [{ ...Q1_TIMETABLE_DRAFT[0], id: 'my-physics', importKey: undefined, teacher: 'My corrected teacher', room: 'My corrected room' }];
  const imported = applyTimetableImport(data);
  assert.equal(imported.schedule.lessons.length, 19);
  assert.equal(imported.schedule.lessons[0].teacher, 'My corrected teacher');
  const corrected = { ...imported, schedule: { ...imported.schedule, lessons: imported.schedule.lessons.map(lesson => lesson.id === 'my-physics' ? { ...lesson, start: '10:00', end: '11:35' } : lesson) } };
  const repeated = applyTimetableImport(normalizeData(corrected));
  assert.equal(repeated.schedule.lessons.length, 19);
  assert.equal(repeated.schedule.lessons[0].start, '10:00');
  assert.equal(repeated.schedule.lessons[0].room, 'My corrected room');
});

test('split or conflicting pre-existing lessons are flagged for review and not blindly replaced', () => {
  const data = fresh();
  data.schedule.lessons = [{ id: 'separate-period-3', subjectId: 'physics', day: 1, start: '09:55', end: '10:40' }, { id: 'separate-period-4', subjectId: 'physics', day: 1, start: '10:45', end: '11:30' }];
  const first = previewTimetableImport(data)[0];
  assert.equal(first.status, 'conflict');
  const result = applyTimetableImport(data);
  assert.equal(result.schedule.lessons.length, 20);
  assert.ok(result.schedule.lessons.some(lesson => lesson.id === 'separate-period-3'));
  assert.ok(!result.schedule.lessons.some(lesson => lesson.id === Q1_TIMETABLE_DRAFT[0].id));
});

test('user-corrected draft intervals are validated and conflicts between selected drafts can be removed by omission', () => {
  const first = Q1_TIMETABLE_DRAFT[0];
  const collision = { ...Q1_TIMETABLE_DRAFT[1], start: '10:00', end: '11:00' };
  assert.ok(previewTimetableImport(fresh(), [first, collision]).every(item => item.status === 'conflict'));
  assert.equal(previewTimetableImport(fresh(), [first])[0].status, 'new');
  assert.equal(previewTimetableImport(fresh(), [{ ...first, periodEnd: 2 }])[0].status, 'invalid');
});

test('reviewed timetable constrains actual daily sessions even with a generous morning study window', () => {
  const data = applyTimetableImport(applyExamImport(fresh()));
  data.schedule.weekly = data.schedule.weekly.map(day => ({ ...day, minutes: 180, windowStart: '08:00', windowEnd: '20:00' }));
  for (const date of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']) {
    const lessons = lessonsForDate(data, date);
    const plan = getDailyPlan(data, date);
    assert.ok(getAvailability(data, date).freeWindows.length > 0);
    assert.ok(plan.tasks.every(task => task.sessions.every(session => lessons.every(lesson => session.end <= lesson.start || session.start >= lesson.end))));
  }
});

test('German 4-point draft never creates a dated or weighted record until missing facts are explicitly supplied', () => {
  const data = fresh();
  assert.equal(hasGermanFourResult(data), false);
  for (const patch of [{ type: '' }, { date: '' }, { date: '2026-02-30' }, { date: '2026-10-20' }, { weight: '' }, { weight: 0 }, { weight: null }, { weight: true }, { confirmed: false }]) {
    assert.throws(() => confirmGermanGradeDraft(data, details(patch), '2026-10-19'));
  }
  assert.equal(data.grades.length, 0);
  const record = confirmGermanGradeDraft(data, details({ type: 'other', weight: 2, note: 'Actual test feedback' }), '2026-10-19');
  assert.deepEqual([record.points, record.type, record.date, record.weight, record.semester], [4, 'other', '2026-10-15', 2, 'Q1']);
  assert.equal(record.note, 'Actual test feedback');
  assert.equal(data.grades.length, 0, 'confirmation returns a proposed grade for the existing grade action to save');
});

test('existing German four-point result is not offered or duplicated regardless of its original ID', () => {
  const data = fresh();
  data.grades = [{ id: 'my-real-test', subjectId: 'german', points: 4, type: 'other', date: '2026-10-12', semester: 'Q1', weight: 1 }];
  assert.equal(hasGermanFourResult(data), true);
  assert.throws(() => confirmGermanGradeDraft(data, details(), '2026-10-19'), /bereits erfasst/);
});

test('lesson metadata survives normalization without adding invented metadata to existing lessons', () => {
  const data = applyTimetableImport(fresh());
  const normalized = normalizeData(data);
  assert.deepEqual(normalized.schedule.lessons, data.schedule.lessons);
  const legacy = normalizeLessons([{ id: 'old', subjectId: 'german', day: 1, start: '08:00', end: '08:45' }])[0];
  assert.equal(Object.hasOwn(legacy, 'periodStart'), false);
  assert.equal(Object.hasOwn(legacy, 'courseCode'), false);
});

test('reviewed document records and metadata survive a complete backup/export restore roundtrip', () => {
  const data = normalizeData(applyTimetableImport(applyExamImport(fresh())), '2026-10-19');
  const restored = parseBackup(serializeBackup(data), '2026-10-19');
  assert.deepEqual(restored.exams, data.exams);
  assert.deepEqual(restored.schedule.lessons, data.schedule.lessons);
  assert.equal(applyExamImport(restored).exams.length, 9);
  assert.equal(applyTimetableImport(restored).schedule.lessons.length, 19);
});

test('explicit exam-review consent activates only selected exam subjects without changing their grades or goals', () => {
  const data = fresh();
  data.subjects = data.subjects.map(subject => ({ ...subject, enabled: ['mathematics', 'physics', 'english', 'german'].includes(subject.id) }));
  const before = structuredClone(data.subjects);
  const optedOut = applyExamImport(data);
  assert.deepEqual(optedOut.subjects, before);
  const optedIn = applyExamImport(data, CONFIRMED_Q1_EXAMS, { includeSubjects: true });
  assert.ok(optedIn.exams.every(exam => optedIn.subjects.find(subject => subject.id === exam.subjectId).enabled));
  assert.equal(optedIn.subjects.find(subject => subject.id === 'sport').enabled, false);
  assert.deepEqual(optedIn.subjects.map(({ enabled, ...subject }) => subject), before.map(({ enabled, ...subject }) => subject));
  assert.ok(optedIn.exams.every(exam => getExamPlan(optedIn, exam.id, '2026-10-19').length > 0));
  const partial = applyExamImport(data, [CONFIRMED_Q1_EXAMS[1]], { includeSubjects: true });
  assert.equal(partial.subjects.find(subject => subject.id === 'computer-science').enabled, true);
  assert.equal(partial.subjects.find(subject => subject.id === 'art').enabled, false);
});

test('a corrected imported German assessment cannot be overwritten by reopening its original draft', () => {
  const data = createPersonalProfile({ today: '2026-10-19' });
  data.grades = [{ id: `${SCHOOL_IMPORT_ID}-german-four`, subjectId: 'german', points: 6, type: 'written', date: '2026-10-15', semester: 'Q1', weight: 2, note: 'Von mir korrigiert' }];
  const before = structuredClone(data.grades);
  assert.equal(hasGermanFourResult(data), true);
  assert.throws(() => confirmGermanGradeDraft(data, { type: 'written', date: '2026-10-15', weight: 1, confirmed: true }, '2026-10-19'), /bereits erfasst/);
  assert.deepEqual(data.grades, before);
});
