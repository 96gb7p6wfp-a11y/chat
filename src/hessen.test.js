import test from 'node:test';
import assert from 'node:assert/strict';
import { HESSEN_SOURCES, HESSEN_GRADE_CONVERSION, HESSEN_EXAM_SCHEDULE, getAbiturTargetPoints, getAbiturGrade, normalizeHessen, calculateAbitur, courseAssessmentPlan, getHessenImportance } from './hessen.js';

const semesters = ['Q1', 'Q2', 'Q3', 'Q4'];
function fixture() {
  const subjects = [
    { id: 'mathematics', name: 'Mathematik', level: 'LK' }, { id: 'physics', name: 'Physik', level: 'LK' },
    ...['german', 'english', 'history', 'politics', 'art', 'religion'].map(id => ({ id, name: id, level: 'GK' })),
  ];
  return { profile: { schoolYear: 'Q1' }, subjects, grades: [], exams: [], schedule: { lessons: [] }, hessen: normalizeHessen() };
}
function complete(data = fixture(), points = 10) {
  data.hessen.semesterResults = data.subjects.flatMap(subject => semesters.map(semester => ({ id: `${subject.id}-${semester}`, subjectId: subject.id, semester, points, status: 'scenario', inclusion: subject.level === 'LK' ? 'mandatory' : 'optional', included: true })));
  data.hessen.examinationSubjects = ['mathematics', 'physics', 'german', 'english', 'history'].map((subjectId, index) => ({ slot: index + 1, subjectId, points, status: 'scenario', mode: index < 3 ? 'written' : 'oral' }));
  return data;
}

test('official source registry distinguishes verified statutory scope from unfinished curriculum research', () => {
  assert.equal(HESSEN_SOURCES.length, 5);
  assert.equal(HESSEN_SOURCES.find(source => source.id === 'oavo-current').verifiedAt, '2026-10-26');
  assert.equal(HESSEN_SOURCES.find(source => source.id === 'kcgo').verifiedAt, null);
  assert.equal(HESSEN_GRADE_CONVERSION.status, 'confirmed');
  assert.match(HESSEN_GRADE_CONVERSION.version, /22.06.2026/);
  const data = complete();
  data.hessen.regulatoryReview = { confirmed: true, checkedDate: '2026-10-26' };
  const result = calculateAbitur(data);
  assert.equal(result.regulatoryValidation.sourcesVerified, true);
  assert.equal(result.regulatoryValidation.complete, false);
  assert.equal(result.verifiedAt, '2026-10-26');
  assert.ok(result.regulatoryValidation.pending.length >= 2);
});

test('examination choices 3–5 remain undecided and clearable', () => {
  const config = normalizeHessen();
  assert.deepEqual(config.examinationSubjects.map(exam => exam.subjectId), ['mathematics', 'physics', '', '', '']);
  assert.ok(config.examinationSubjects.every(exam => exam.points === null));
  assert.equal(normalizeHessen({ examinationSubjects: [{ slot: 1, subjectId: '' }] }).examinationSubjects[0].subjectId, '');
  assert.equal(calculateAbitur(fixture()).totalPoints, null);
});

test('Block I doubles eight LK results and counts only 24 selected GK results', () => {
  const data = complete();
  data.hessen.semesterResults.push({ id: 'extra-unselected', subjectId: 'german', semester: 'Q1', points: 15, status: 'confirmed', inclusion: 'optional', included: false });
  const result = calculateAbitur(data);
  assert.deepEqual([result.blockI.lkCount, result.blockI.gkCount, result.blockI.points], [8, 24, 400]);
  assert.equal(result.blockII.points, 200);
  assert.equal(result.totalPoints, 600);
  assert.equal(result.blockI.scenarioCount, 32);
  assert.equal(result.blockI.confirmedCount, 0);
  assert.equal(result.blockII.scenarioCount, 5);
});

test('maximum ordinary 600 + 300 arithmetic and target gap are transparent', () => {
  const data = complete(fixture(), 15);
  data.hessen.targetPoints = 820;
  const result = calculateAbitur(data);
  assert.equal(result.blockI.points, 600);
  assert.equal(result.blockII.points, 300);
  assert.equal(result.totalPoints, 900);
  assert.equal(result.targetGap, -80);
  assert.ok(result.timeline.every(term => term.contribution === 150 && term.scenarios === 8));
});

test('individual exams and undated starting estimates never become semester points', () => {
  const data = fixture();
  data.subjects[0].written = 8.5;
  data.grades = [{ id: 'german-test', subjectId: 'german', semester: 'Q1', date: '2026-10-15', points: 4, type: 'written' }];
  const result = calculateAbitur(data);
  assert.equal(result.blockI.lkCount, 0);
  assert.equal(result.blockI.gkCount, 0);
  assert.equal(result.blockI.points, null);
  assert.equal(result.blockI.knownPoints, 0);
});

test('missing semester points stay unknown; zero is a real result', () => {
  const data = complete();
  data.hessen.semesterResults[0].points = null;
  let result = calculateAbitur(data);
  assert.equal(result.blockI.points, null);
  assert.equal(result.blockI.missingPointsCount, 1);
  data.hessen.semesterResults[0].points = 0;
  result = calculateAbitur(data);
  assert.equal(result.blockI.points, 380);
  assert.equal(result.blockI.missingPointsCount, 0);
  assert.equal(result.regulatoryValidation.complete, false);
});

test('a required result stays selected and an excluded optional result stays out', () => {
  const config = normalizeHessen({ semesterResults: [
    { id: 'required', subjectId: 'german', semester: 'Q1', points: 10, inclusion: 'mandatory', included: false },
    { id: 'excluded', subjectId: 'english', semester: 'Q1', points: 15, inclusion: 'excluded', included: true },
  ] });
  assert.equal(config.semesterResults[0].included, true);
  assert.equal(config.semesterResults[1].included, false);
});

test('duplicate subject-semester selections and duplicate exam subjects prevent complete totals', () => {
  const data = complete();
  data.hessen.semesterResults.push({ ...data.hessen.semesterResults[0], id: 'another-math-q1' });
  data.hessen.examinationSubjects[4].subjectId = 'english';
  const result = calculateAbitur(data);
  assert.equal(result.blockI.points, null);
  assert.equal(result.blockII.points, null);
  assert.ok(result.issues.some(issue => issue.code === 'duplicate-semester'));
  assert.ok(result.issues.some(issue => issue.code === 'duplicate-exam-subject'));
});

test('all eight LK course-semester cells must exist, not merely eight LK records', () => {
  const data = complete();
  data.hessen.semesterResults[0].subjectId = 'german';
  const result = calculateAbitur(data);
  assert.equal(result.blockI.points, null);
  assert.ok(result.issues.some(issue => issue.code === 'lk-semester-missing' && issue.semester === 'Q1' && issue.subjectId === 'mathematics'));
});

test('English three-hour GK expects one Klausur and never invents a second date', () => {
  const data = fixture();
  data.exams = [{ id: 'english-q1', subjectId: 'english', title: 'Englisch · Q1-Klausur', date: '2026-10-26', format: 'written' }];
  const before = JSON.stringify(data.exams);
  const plan = courseAssessmentPlan(data, 'english', 'Q1');
  assert.equal(plan.weeklyHours, 3);
  assert.equal(plan.expected, 1);
  assert.equal(plan.unscheduledCount, 0);
  assert.equal(plan.additionalMessage, '');
  assert.equal(JSON.stringify(data.exams), before);
});

test('Mathematics LK needs two Q1 Klausuren and German four-hour GK also needs two with context hours labelled', () => {
  const data = fixture();
  data.exams = [
    { id: 'math-known', subjectId: 'mathematics', title: 'Mathematik · Q1-Klausur', date: '2026-12-17' },
    { id: 'german-known', subjectId: 'german', title: 'Deutsch · Q1-Klausur', date: '2026-12-09' },
  ];
  for (const id of ['mathematics', 'german']) {
    const plan = courseAssessmentPlan(data, id, 'Q1');
    assert.equal(plan.expected, 2);
    assert.equal(plan.unscheduledCount, 1);
    assert.equal(plan.additionalMessage, 'Eine weitere Klausur vorgesehen — Termin noch offen.');
    assert.equal(plan.provisional, id === 'german');
  }
});

test('actual configured GK hours override context, unknown hours do not infer a count', () => {
  const data = fixture();
  data.hessen.courseSettings = [{ subjectId: 'english', weeklyHours: 4, teacherConfirmed: true }];
  assert.equal(courseAssessmentPlan(data, 'english', 'Q2').expected, 2);
  assert.equal(courseAssessmentPlan(data, 'history', 'Q2').expected, null);
  assert.equal(courseAssessmentPlan(data, 'english', 'Q2').hoursSource, 'teacher');
});

test('timetable merged periods determine weekly hours without double-counting A/B alternatives', () => {
  const data = fixture();
  data.schedule.lessons = [
    { subjectId: 'history', day: 1, periodStart: 1, periodEnd: 2, cycle: 'all', term: 'Q1' },
    { subjectId: 'history', day: 2, periodStart: 3, periodEnd: 3, cycle: 'A', term: 'Q1' },
    { subjectId: 'history', day: 3, periodStart: 3, periodEnd: 3, cycle: 'B', term: 'Q1' },
  ];
  const plan = courseAssessmentPlan(data, 'history', 'Q1');
  assert.equal(plan.weeklyHours, 3);
  assert.equal(plan.expected, 1);
  assert.equal(plan.hoursSource, 'timetable');
  data.schedule.lessons.pop();
  assert.equal(courseAssessmentPlan(data, 'history', 'Q1').weeklyHours, null);
});

test('Q4 generally needs one course assessment; a teacher-confirmed exception can replace the count', () => {
  const data = fixture();
  assert.equal(courseAssessmentPlan(data, 'mathematics', 'Q4').expected, 1);
  assert.equal(courseAssessmentPlan(data, 'german', 'Q4').expected, 1);
  data.hessen.courseSettings = [{ subjectId: 'german', semester: 'Q4', weeklyHours: 4, countOverride: 0, teacherConfirmed: false }];
  assert.equal(courseAssessmentPlan(data, 'german', 'Q4').expected, 1);
  data.hessen.courseSettings[0].teacherConfirmed = true;
  assert.equal(courseAssessmentPlan(data, 'german', 'Q4').expected, 0);
});

test('presentation/oral/practical replacements require explicit teacher confirmation', () => {
  const data = fixture();
  data.hessen.courseSettings = [{ subjectId: 'german', semester: 'Q1', weeklyHours: 4, replacements: [{ id: 'oral-alternative', kind: 'oral-communication', count: 1, note: 'Mit Lehrkraft bestätigt' }], teacherConfirmed: false }];
  let plan = courseAssessmentPlan(data, 'german', 'Q1');
  assert.equal(plan.replacementCount, 0);
  assert.equal(plan.unscheduledCount, 2);
  data.hessen.courseSettings[0].teacherConfirmed = true;
  plan = courseAssessmentPlan(data, 'german', 'Q1');
  assert.equal(plan.replacementCount, 1);
  assert.equal(plan.unscheduledCount, 1);
});

test('semester count never assigns an unlabelled dated exam to an invented semester', () => {
  const data = fixture();
  data.exams = [{ id: 'unknown-term', subjectId: 'english', title: 'English exam', date: '2027-03-01' }];
  assert.equal(courseAssessmentPlan(data, 'english', 'Q1').scheduledCount, 0);
  data.exams[0].semester = 'Q2';
  assert.equal(courseAssessmentPlan(data, 'english', 'Q2').scheduledCount, 1);
});

test('short tests, oral and practical events do not count as scheduled Klausuren', () => {
  const data = fixture();
  data.exams = ['test', 'oral', 'practical', 'written', undefined].map((format, index) => ({ id: `format-${index}`, subjectId: 'german', title: 'Deutsch · Q1', semester: 'Q1', date: '2026-12-09', ...(format ? { format } : {}) }));
  const plan = courseAssessmentPlan(data, 'german', 'Q1');
  assert.deepEqual(plan.scheduled.map(exam => exam.id), ['format-3', 'format-4']);
  assert.equal(plan.scheduledCount, 2);
  assert.equal(plan.replacementCount, 0);
});

test('explicit exam semester overrides conflicting titles and legacy import keys', () => {
  const data = fixture();
  data.exams = [{ id: 'explicit-q2', subjectId: 'english', title: 'English · Q1-Klausur', importKey: 'q1-hessen-2026-exam-english', semester: 'Q2', date: '2027-03-01', format: 'written' }];
  assert.equal(courseAssessmentPlan(data, 'english', 'Q1').scheduledCount, 0);
  assert.equal(courseAssessmentPlan(data, 'english', 'Q2').scheduledCount, 1);
  data.exams[0] = { ...data.exams[0], title: 'English · Q2', semester: 'Q1' };
  assert.equal(courseAssessmentPlan(data, 'english', 'Q1').scheduledCount, 1);
  assert.equal(courseAssessmentPlan(data, 'english', 'Q2').scheduledCount, 0);
});

test('course importance exposes LK contribution separately from priority urgency', () => {
  const data = complete();
  const math = getHessenImportance(data, 'mathematics');
  const german = getHessenImportance(data, 'german');
  assert.equal(math.factor, 2);
  assert.equal(german.factor, 1);
  assert.equal(math.selectedExam, true);
  assert.equal(math.includedCount, 4);
  assert.match(math.reason, /anderes Fach dringender/);
  assert.equal(math.verified, true);
});

test('normalization retains missing values and refuses non-integer confirmed semester scores', () => {
  const config = normalizeHessen({ semesterResults: [{ id: 'math', subjectId: 'mathematics', semester: 'Q1', points: 8.5, status: 'confirmed' }], targetPoints: 901, regulatoryReview: { confirmed: true, checkedDate: '2026-02-30' } });
  assert.equal(config.semesterResults[0].points, null);
  assert.equal(config.targetPoints, null);
  assert.equal(config.regulatoryReview.checkedDate, '');
  assert.deepEqual(normalizeHessen(config), config);
});


test('teacher exceptions and replacements are isolated by semester', () => {
  const data = fixture();
  data.hessen.courseSettings = [
    { subjectId: 'german', semester: '', weeklyHours: 4, countOverride: 0, teacherConfirmed: true },
    { subjectId: 'german', semester: 'Q1', countOverride: 1, teacherConfirmed: true, replacements: [{ id: 'presentation', kind: 'presentation', count: 1 }] },
  ];
  assert.equal(courseAssessmentPlan(data, 'german', 'Q1').expected, 1);
  assert.equal(courseAssessmentPlan(data, 'german', 'Q1').replacementCount, 1);
  assert.equal(courseAssessmentPlan(data, 'german', 'Q2').expected, 2);
  assert.equal(courseAssessmentPlan(data, 'german', 'Q4').expected, 1);
  assert.equal(courseAssessmentPlan(data, 'german', 'Q4').replacementCount, 0);
  assert.equal(courseAssessmentPlan(data, 'german', 'Q4').weeklyHours, 4);
  assert.equal(courseAssessmentPlan(data, 'german', 'Q4').unassignedException, true);
  assert.equal(normalizeHessen(data.hessen).courseSettings.length, 2);
});


test('official Annex 10b boundaries use the ordinary 900-point table', () => {
  for (const [grade, threshold] of [[1, 823], [1.1, 805], [1.3, 769], [1.5, 733], [1.7, 697], [2, 643], [3.9, 301], [4, 300]]) {
    assert.equal(getAbiturTargetPoints(grade), threshold);
    assert.equal(getAbiturGrade(threshold), grade);
    if (grade !== 4) assert.equal(getAbiturGrade(threshold - 1), Math.round((grade + 0.1) * 10) / 10);
  }
  for (const invalid of [null, '', true, 0.9, 4.1, 1.25]) assert.equal(getAbiturTargetPoints(invalid), null);
  for (const invalid of [null, '733', 299, 901, 733.5]) assert.equal(getAbiturGrade(invalid), null);
});

function legalSelection() {
  const data = fixture();
  data.subjects.push({ id: 'computer-science', level: 'GK' });
  const counts = { mathematics: 4, physics: 4, german: 4, english: 4, history: 4, politics: 4, art: 2, religion: 4, 'computer-science': 2 };
  data.hessen.semesterResults = data.subjects.flatMap(subject => semesters.slice(0, counts[subject.id]).map(semester => ({ id: `${subject.id}-${semester}`, subjectId: subject.id, semester, points: 10, status: 'confirmed', included: true })));
  data.hessen.examinationSubjects = ['mathematics', 'physics', 'german', 'english', 'history'].map((subjectId, index) => ({ slot: index + 1, subjectId, points: 10, status: 'scenario', mode: index < 3 ? 'written' : 'oral' }));
  return data;
}
const check = (data, code) => calculateAbitur(data).regulatoryValidation.checks.find(item => item.code === code);

test('mandatory inclusion checks catch the additional subject while ordinary counts stay arithmetic', () => {
  const data = legalSelection();
  assert.equal(calculateAbitur(data).totalPoints, 600);
  assert.equal(check(data, 'additional-subject-inclusion').status, 'met');
  assert.equal(check(data, 'foreign-language-inclusion').status, 'met');
  assert.equal(calculateAbitur(data).regulatoryValidation.complete, false);
  data.hessen.semesterResults = data.hessen.semesterResults.filter(result => result.subjectId !== 'computer-science');
  data.hessen.semesterResults.push(...['Q3', 'Q4'].map(semester => ({ id: `art-${semester}`, subjectId: 'art', semester, points: 10, included: true })));
  assert.equal(calculateAbitur(data).blockI.gkCount, 24);
  assert.equal(check(data, 'additional-subject-inclusion').status, 'risk');
});

test('zero semester results and underkurs boundaries remain risks even in a numerically high total', () => {
  const data = legalSelection();
  data.hessen.semesterResults[0].points = 0;
  assert.equal(check(data, 'included-zero').status, 'risk');
  for (const result of data.hessen.semesterResults.slice(0, 3)) result.points = 4;
  assert.equal(check(data, 'insufficient-courses').status, 'risk');
  data.hessen.semesterResults.forEach(result => { result.points = 10; });
  for (const result of data.hessen.semesterResults.slice(8, 14)) result.points = 4;
  assert.equal(check(data, 'insufficient-courses').status, 'met');
  data.hessen.semesterResults[14].points = 4;
  assert.equal(check(data, 'insufficient-courses').status, 'risk');
});

test('examination subject fields, minima and zero final results are independently checked', () => {
  const data = legalSelection();
  assert.equal(check(data, 'exam-fields').status, 'met');
  assert.equal(check(data, 'written-fields').status, 'met');
  data.hessen.examinationSubjects[4].subjectId = 'art';
  assert.equal(check(data, 'exam-fields').status, 'risk');
  data.hessen.examinationSubjects[2].subjectId = 'computer-science';
  assert.equal(check(data, 'mandatory-exam-subjects').status, 'risk');
  assert.equal(check(data, 'written-fields').status, 'risk');
  data.hessen.examinationSubjects.forEach(exam => { exam.points = 4; });
  data.hessen.examinationSubjects.slice(2).forEach(exam => { exam.points = 8; });
  assert.equal(check(data, 'exam-minimum-subjects').status, 'risk');
  data.hessen.examinationSubjects[0].points = 5;
  assert.equal(check(data, 'exam-minimum-subjects').status, 'met');
  data.hessen.examinationSubjects[1].points = 0;
  assert.equal(check(data, 'exam-zero').status, 'risk');
});

test('published written 2028 timetable is source-specific and never changes school exam records', () => {
  const data = legalSelection();
  data.exams = [{ id: 'school', subjectId: 'english', date: '2026-10-26' }];
  const original = structuredClone(data);
  const result = calculateAbitur(data);
  assert.equal(result.examSchedule.q4Ends, '2028-03-31');
  for (const [id, date] of [['german', '2028-04-26'], ['english', '2028-04-28'], ['mathematics', '2028-05-03'], ['physics', '2028-05-10']]) assert.equal(HESSEN_EXAM_SCHEDULE.exams.find(exam => exam.subjectId === id).date, date);
  assert.deepEqual(data, original);
});

test('Sport uses special practical assessments and modern languages apply Q3 communication rules', () => {
  const data = fixture();
  data.subjects.push({ id: 'sport', level: 'GK' });
  data.hessen.courseSettings = [{ subjectId: 'sport', weeklyHours: 3 }];
  let plan = courseAssessmentPlan(data, 'sport', 'Q1');
  assert.deepEqual(plan.requiredKinds, ['practical']);
  assert.match(plan.additionalMessage, /Besondere Fachprüfung/);
  data.exams = [{ id: 'sport', subjectId: 'sport', semester: 'Q1', format: 'practical', date: '2026-12-01' }];
  assert.equal(courseAssessmentPlan(data, 'sport', 'Q1').unscheduledCount, 0);
  data.hessen.examinationSubjects[2] = { slot: 3, subjectId: 'english', mode: 'written' };
  plan = courseAssessmentPlan(data, 'english', 'Q3');
  assert.deepEqual(plan.requiredKinds, ['oral']);
  assert.match(plan.additionalMessage, /Kommunikationsprüfung/);
  assert.deepEqual(courseAssessmentPlan(data, 'english', 'Q1').requiredKinds, ['written']);
  data.subjects.find(subject => subject.id === 'english').level = 'LK';
  assert.deepEqual(courseAssessmentPlan(data, 'english', 'Q3').requiredKinds, ['written', 'oral']);
});
