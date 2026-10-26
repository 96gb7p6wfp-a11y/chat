/**
 * Northstar's local coaching model. All mutations are pure: a storage adapter can
 * persist their return value now, or synchronise it with an account later.
 * Recommendations are explainable heuristics, never admission predictions.
 */
import { createStudyState, getStudyStats, normalizeStudy } from './study.js';
import { getEventCandidates, getEventPlan, normalizeEvents } from './events.js';
import { getRoadmap as buildRoadmap, getRoadmapPriorities, taskCategoryForMilestone } from './roadmap.js';
import { calculateSubject, normalizeAcademicGrade, normalizeGrading, normalizeGradeForecast } from './grades.js';
import { getSubjectPriorities } from './recommendations.js';
import { normalizeLessons, lessonBlocks } from './timetable.js';
import { normalizeIELTS, getIELTSCandidates, getIELTSSummary } from './ielts.js';
import { normalizeSAT, getSATCandidates, getSATSummary } from './sat.js';
import { normalizeLearning, getLearningReviews, getTaskLearningMetadata } from './guided-learning.js';
export { getSubjectPriorities } from './recommendations.js';

const CATEGORIES = ['academics', 'language', 'university', 'activity', 'review'];
const SUBJECTS = [
  ['mathematics', 'Mathematics', 'LK'], ['physics', 'Physics', 'LK'],
  ['english', 'English', 'GK'], ['german', 'German', 'GK'],
  ['history', 'History', 'GK'], ['politics', 'Politics / Economics', 'GK'],
  ['computer-science', 'Computer Science', 'GK'], ['art', 'Art', 'GK'],
  ['religion', 'Religion', 'GK'], ['sport', 'Sport', 'GK'],
];
const DEFAULT_PROFILE = {
  name: '', schoolYear: 'Q1', schoolSystem: 'Hessen · Gymnasium', graduationYear: '2028',
  universityStartYear: '', applicationYear: '', pathways: ['USA', 'Germany'],
  targetFields: ['Computer Science', 'Artificial Intelligence', 'Economics', 'Business'], prioritySubjects: ['german'],
  englishLevel: 'Not sure yet', germanLevel: 'Not sure yet', academicGoalNotes: '', theme: 'system', testPlans: [],
};
const DAY = 86_400_000;
const list = (value, max = 10000) => Array.isArray(value) ? value.slice(0, max) : [];
const text = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = (value, fallback, min, max) => {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const integer = (value, fallback, min, max) => {
  const result = number(value, fallback, min, max);
  return result === null ? null : Math.round(result);
};
const words = (value, max = 40) => [...new Set((Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\n]/) : []).map(v => text(v, 200)).filter(Boolean))].slice(0, max);
const uniqueRecords = (values, convert) => {
  const seen = new Set();
  return list(values).map(convert).filter(record => {
    if (!record || !record.id || seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
};

export function uid(prefix = 'entry') {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
}
export function localDateKey(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('A valid Date is required.');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2200) return false;
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
function calendar(date) {
  if (!isDateKey(date)) throw new TypeError('A real YYYY-MM-DD calendar date is required.');
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
export function shiftDate(date, days) {
  const value = calendar(date);
  value.setDate(value.getDate() + days);
  return localDateKey(value);
}
export function startOfWeek(date) {
  return shiftDate(date, -((calendar(date).getDay() + 6) % 7));
}
function daysBetween(a, b) {
  // UTC calendar components prevent daylight-saving days changing revision stages.
  return Math.round((Date.UTC(...b.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v))) - Date.UTC(...a.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)))) / DAY);
}
const clockMinutes = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const safeClock = (value, fallback) => clockMinutes(value) !== null ? value : fallback;
const validStamp = value => typeof value === 'string' && value.includes('T') && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
function completionDate(task) {
  return task.completed && task.completedAt ? localDateKey(new Date(task.completedAt)) : null;
}
function normalProfile(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const profile = { ...DEFAULT_PROFILE };
  for (const key of ['name', 'schoolYear', 'schoolSystem', 'graduationYear', 'universityStartYear', 'applicationYear', 'englishLevel', 'germanLevel']) {
    if (typeof value[key] === 'string' || typeof value[key] === 'number') profile[key] = text(String(value[key]), 200);
  }
  profile.pathways = words(value.pathways ?? DEFAULT_PROFILE.pathways).filter(path => ['USA', 'Germany'].includes(path));
  profile.targetFields = words(value.targetFields ?? DEFAULT_PROFILE.targetFields);
  profile.theme = ['light', 'dark', 'system'].includes(value.theme) ? value.theme : 'system';
  profile.academicGoalNotes = text(value.academicGoalNotes ?? value.gradeGoal, 600);
  profile.testPlans = uniqueRecords(value.testPlans, test => {
    if (!test || !text(test.name, 100)) return null;
    return { id: text(test.id, 150) || uid('test'), name: text(test.name, 100), status: text(test.status, 100) || 'considering', targetDate: isDateKey(test.targetDate) ? test.targetDate : '', targetScore: text(String(test.targetScore ?? ''), 100), notes: text(test.notes) };
  });
  profile.prioritySubjects = words(value.prioritySubjects ?? DEFAULT_PROFILE.prioritySubjects);
  profile.targetAverage = number(value.targetAverage, null, 0, 15);
  profile.language = value.language === 'en' ? 'en' : 'de';
  return profile;
}
function normalSubject(subject) {
  if (!subject || !text(subject.id, 150) || !text(subject.name, 150)) return null;
  return { id: text(subject.id, 150), name: text(subject.name, 150), level: subject.level === 'LK' ? 'LK' : 'GK', written: number(subject.written, null, 0, 15), oral: number(subject.oral, null, 0, 15), baselineWritten: number(Object.hasOwn(subject, 'baselineWritten') ? subject.baselineWritten : subject.written, null, 0, 15), baselineOral: number(Object.hasOwn(subject, 'baselineOral') ? subject.baselineOral : subject.oral, null, 0, 15), target: number(subject.target, Object.hasOwn(subject, 'target') ? null : 10, 0, 15), weakTopics: words(subject.weakTopics), enabled: subject.enabled !== false,
    grading: normalizeGrading(subject.grading), forecast: normalizeGradeForecast(subject.forecast), priority: ['auto', 'high', 'low'].includes(subject.priority) ? subject.priority : 'auto', difficulty: integer(subject.difficulty, null, 1, 5) };
}
function normalExam(exam) {
  if (!exam || !text(exam.id, 150) || !text(exam.title, 300) || !isDateKey(exam.date)) return null;
  return { id: text(exam.id, 150), title: text(exam.title, 300), subjectId: text(exam.subjectId, 150), date: exam.date, topics: words(exam.topics), format: ['written', 'oral', 'test', 'practical'].includes(exam.format) ? exam.format : 'written', target: number(exam.target, Object.hasOwn(exam, 'target') ? null : 10, 0, 15), time: clockMinutes(exam.time) !== null ? exam.time : '', importance: ['low', 'normal', 'high'].includes(exam.importance) ? exam.importance : 'normal', notes: text(exam.notes, 3000), preparation: text(exam.preparation, 3000), importKey: text(exam.importKey, 150), room: text(exam.room, 100), ...(exam.level === 'LK' || exam.level === 'GK' ? { level: exam.level } : {}), ...(isDateKey(exam.createdDate) ? { createdDate: exam.createdDate } : {}) };
}
function normalTask(task) {
  if (!task || !text(task.id, 200) || !text(task.title, 300) || !isDateKey(task.date)) return null;
  const completedAt = task.completed === true ? validStamp(task.completedAt) : null;
  return {
    id: text(task.id, 200), date: task.date, title: text(task.title, 300), category: CATEGORIES.includes(task.category) ? task.category : 'academics',
    subjectId: text(task.subjectId, 150), examId: text(task.examId, 150), goalId: text(task.goalId, 150), minutes: integer(task.minutes, 15, 1, 720),
    roadmapItemId: text(task.roadmapItemId, 200), roadmapStepId: text(task.roadmapStepId, 200), linkedGoal: text(task.linkedGoal, 400), eventId: text(task.eventId, 220), eventSourceId: text(task.eventSourceId, 200), eventStage: text(task.eventStage, 100),
    priority: ['high', 'medium', 'low'].includes(task.priority) ? task.priority : 'medium', reason: text(task.reason, 1200), steps: words(task.steps, 12),
    resource: text(task.resource, 1000), completed: Boolean(completedAt), completedAt, notes: text(task.notes, 5000), selfReview: [...new Set(words(task.selfReview).map(value => value.slice(0, 150)))].slice(0, 12),
    origin: task.origin === 'generated' ? 'generated' : 'custom', revisionStage: text(task.revisionStage, 100), revisionPlanId: text(task.revisionPlanId, 200), planSignature: text(task.planSignature, 100),
    sessions: list(task.sessions, 20).filter(session => clockMinutes(session?.start) !== null && clockMinutes(session?.end) !== null && clockMinutes(session.end) > clockMinutes(session.start)).map(session => ({ start: session.start, end: session.end })),
    start: clockMinutes(task.start) !== null ? task.start : '', end: clockMinutes(task.end) !== null ? task.end : '',
    objective: text(task.objective, 500), expectedResult: text(task.expectedResult, 700), learningTopic: text(task.learningTopic, 300), ieltsSkill: ['listening', 'reading', 'writing', 'speaking'].includes(task.ieltsSkill) ? task.ieltsSkill : '', satSkill: ['readingWriting', 'math', 'full'].includes(task.satSkill) ? task.satSkill : '',
    movedFrom: isDateKey(task.movedFrom) ? task.movedFrom : '', reviewDate: isDateKey(task.reviewDate) ? task.reviewDate : '',
    ...(task.skipped !== undefined ? { skipped: task.skipped === true && !completedAt } : {}),
  };
}
function normalActivity(activity) {
  if (!activity || !text(activity.id, 150) || !text(activity.name, 300)) return null;
  return { id: text(activity.id, 150), name: text(activity.name, 300), type: text(activity.type, 100) || 'Project', startDate: isDateKey(activity.startDate) ? activity.startDate : '', endDate: isDateKey(activity.endDate) && (!isDateKey(activity.startDate) || activity.endDate >= activity.startDate) ? activity.endDate : '', updatedDate: isDateKey(activity.updatedDate) ? activity.updatedDate : '', hoursPerWeek: number(activity.hoursPerWeek, null, 0, 168), weeksPerYear: number(activity.weeksPerYear, null, 0, 52) === null ? null : integer(activity.weeksPerYear, null, 0, 52), description: text(activity.description, 4000), responsibilities: text(activity.responsibilities, 4000), achievements: text(activity.achievements, 4000), impact: text(activity.impact, 2000), notes: text(activity.notes, 4000),
    evidenceStatus: ['planned', 'self-reported', 'verified'].includes(activity.evidenceStatus) ? activity.evidenceStatus : 'self-reported', projectUrl: safeURL(activity.projectUrl), evidence: uniqueRecords(activity.evidence, record => record && text(record.id, 150) ? { id: text(record.id, 150), label: text(record.label, 300), url: safeURL(record.url), note: text(record.note, 2000), verifiedDate: isDateKey(record.verifiedDate) ? record.verifiedDate : '' } : null) };
}
function safeURL(value) {
  const url = text(value, 1200);
  if (!url) return '';
  try { return ['https:', 'http:'].includes(new URL(url).protocol) ? url : ''; } catch { return ''; }
}
function normalUniversity(university) {
  if (!university || !text(university.id, 150) || !text(university.name, 300)) return null;
  return { id: text(university.id, 150), name: text(university.name, 300), country: university.country === 'Germany' ? 'Germany' : 'USA', program: text(university.program, 300), deadline: isDateKey(university.deadline) ? university.deadline : '', requirements: text(university.requirements, 4000), notes: text(university.notes, 4000), url: safeURL(university.url), status: ['researching', 'shortlisted', 'applied'].includes(university.status) ? university.status : 'researching', requirementsStatus: university.requirementsStatus === 'verified' ? 'verified' : 'general', requirementsSource: safeURL(university.requirementsSource), requirementsCheckedDate: isDateKey(university.requirementsCheckedDate) ? university.requirementsCheckedDate : '' };
}
function defaultSchedule() {
  return { weekly: [120, 120, 60, 150, 85, 75, 150].map((minutes, day) => ({ day, minutes, windowStart: day === 0 || day === 6 ? '09:00' : '16:00', windowEnd: day === 0 || day === 6 ? '20:00' : '21:00' })), fixedActivities: [], timeOverrides: [] };
}
function normalSchedule(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const defaults = defaultSchedule();
  const weekly = defaults.weekly.map(defaultDay => {
    const input = list(value.weekly, 7).find(day => Number(day?.day) === defaultDay.day) ?? defaultDay;
    const start = safeClock(input.windowStart, defaultDay.windowStart);
    const end = safeClock(input.windowEnd, defaultDay.windowEnd);
    return { day: defaultDay.day, minutes: integer(input.minutes, defaultDay.minutes, 0, 720), windowStart: start, windowEnd: clockMinutes(end) > clockMinutes(start) ? end : start };
  });
  const fixedActivities = uniqueRecords(value.fixedActivities, event => {
    if (!event || !text(event.id, 150) || !text(event.title, 300) || clockMinutes(event.start) === null || clockMinutes(event.end) === null || clockMinutes(event.end) <= clockMinutes(event.start)) return null;
    const date = isDateKey(event.date) ? event.date : '';
    const days = [...new Set(list(event.days, 7).map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))];
    if (!date && !days.length) return null;
    return { id: text(event.id, 150), title: text(event.title, 300), days, date, start: event.start, end: event.end, category: text(event.category, 100) || 'appointment' };
  });
  const overrides = new Map();
  for (const override of list(value.timeOverrides, 1000)) if (isDateKey(override?.date)) overrides.set(override.date, { date: override.date, minutes: integer(override.minutes, 0, 0, 720) });
  return { weekly, fixedActivities, timeOverrides: [...overrides.values()], lessons: normalizeLessons(value.lessons), cycleAnchor: isDateKey(value.cycleAnchor) ? value.cycleAnchor : '' };
}

export function createInitialData({ today = localDateKey(), demo = true } = {}) {
  if (!isDateKey(today)) throw new TypeError('Initial date is invalid.');
  let state = {
    version: 2, createdDate: today, onboardingCompleted: false, demo: Boolean(demo),
    profile: normalProfile(), subjects: SUBJECTS.map(([id, name, level]) => ({ id, name, level, written: null, oral: null, baselineWritten: null, baselineOral: null, target: 10, weakTopics: [], enabled: ['mathematics', 'physics', 'english', 'german'].includes(id) })),
    exams: [], events: [], tasks: [], grades: [], activities: [], universities: [], schedule: normalSchedule(), weeklyReviews: [], roadmapCompleted: [], reflections: [], legacyMilestones: [], dismissedTaskIds: [], study: createStudyState(), ielts: normalizeIELTS(), sat: normalizeSAT(), learning: normalizeLearning(),
  };
  state.universities = [
    { id: 'ucla', name: 'UCLA', country: 'USA', program: 'Explore data, business and technology programmes', deadline: '', requirements: 'Verify current UC requirements for international applicants. UC does not consider SAT/ACT for admission; check each programme and English-proficiency policy.', notes: 'Aspirational option. Keep a balanced list and research cost and financial support.', url: 'https://admission.ucla.edu/apply/international-applicants', status: 'researching' },
    { id: 'berkeley', name: 'UC Berkeley', country: 'USA', program: 'Explore data, business and technology programmes', deadline: '', requirements: 'Verify current UC requirements and course prerequisites. SAT/ACT are not considered for UC admission.', notes: 'Admission is selective; requirements and deadlines need official confirmation.', url: 'https://admissions.berkeley.edu/apply-to-berkeley/international-students/', status: 'researching' },
  ];
  state.subjects = state.subjects.map(normalSubject);
  state.universities = state.universities.map(normalUniversity);
  if (!demo) return state;
  // The explicit demo represents a sample week, rather than an installation
  // with real activity before its creation date.
  state.createdDate = shiftDate(today, -7);
  state.profile.englishLevel = 'B2';
  state.profile.germanLevel = 'Native / fluent';
  const samples = {
    mathematics: { written: 6, oral: 11, target: 11, weakTopics: ['Derivatives', 'Curve discussion'] },
    physics: { written: 9, oral: 10, target: 12, weakTopics: ['Electric fields'] },
    english: { written: 7, oral: 9, target: 11, weakTopics: ['Analysis structure', 'Precise academic vocabulary'] },
    german: { written: 8, oral: 10, target: 11, weakTopics: ['Argumentation', 'Sentence structure'] },
  };
  state.subjects = state.subjects.map(subject => ({ ...subject, ...(samples[subject.id] ?? {}), baselineWritten: samples[subject.id]?.written ?? null, baselineOral: samples[subject.id]?.oral ?? null }));
  state.exams = [
    { id: 'demo-math-exam', subjectId: 'mathematics', title: 'Mathematics Klausur', date: shiftDate(today, 12), topics: ['Derivatives', 'Curve discussion', 'Applied optimisation'], format: 'written', target: 11 },
    { id: 'demo-english-exam', subjectId: 'english', title: 'English Klausur', date: shiftDate(today, 18), topics: ['American Dream', 'US history', 'Civil Rights', 'Summary', 'Analysis', 'Comment'], format: 'written', target: 11 },
    { id: 'demo-physics-exam', subjectId: 'physics', title: 'Physics Klausur', date: shiftDate(today, 27), topics: ['Electric fields', 'Potential', 'Worked problems'], format: 'written', target: 12 },
  ];
  state.grades = Object.entries(samples).flatMap(([subjectId, subject], index) => ['written', 'oral'].map(type => ({ id: `demo-grade-${subjectId}-${type}`, subjectId, points: subject[type], type, date: shiftDate(today, -8 - index), note: 'Demo grade — replace with your own result.' })));
  state.activities = [
    { id: 'demo-volleyball', name: 'Competitive volleyball', type: 'Sport', startDate: `${Number(today.slice(0, 4)) - 2}-09-01`, hoursPerWeek: 5, weeksPerYear: 40, description: 'Demo: regular team training and competition. Add your actual team, role and schedule.', achievements: '', impact: '' },
    { id: 'demo-restaurant', name: 'Restaurant management', type: 'Work / entrepreneurship', startDate: `${today.slice(0, 4)}-01-01`, hoursPerWeek: 3, weeksPerYear: 30, description: 'Demo: describe your real responsibilities, decisions and lessons.', achievements: '', impact: '' },
    { id: 'demo-marketing', name: 'Social media / marketing', type: 'Project', startDate: `${today.slice(0, 4)}-04-01`, hoursPerWeek: 2, weeksPerYear: 25, description: 'Demo: describe the audience, content and your own contribution.', achievements: '', impact: '' },
  ];
  state.activities = state.activities.map(normalActivity);
  state.schedule.fixedActivities = [
    { id: 'demo-school', title: 'School', days: [1, 2, 3, 4, 5], date: '', start: '08:00', end: '15:00', category: 'school' },
    { id: 'demo-volleyball-weekly', title: 'Volleyball training', days: [2, 4], date: '', start: '17:30', end: '19:00', category: 'sport' },
    { id: 'demo-work', title: 'Restaurant work', days: [6], date: '', start: '10:00', end: '12:00', category: 'work' },
  ];
  state.universities.push({ id: 'demo-germany', name: 'TU Darmstadt', country: 'Germany', program: 'Explore Business Informatics / Computer Science', deadline: '', requirements: 'Check current programme admission, NC or aptitude rules, application route and required documents on the official site.', notes: 'Parallel German option — sample, not a confirmed application choice.', url: 'https://www.tu-darmstadt.de/studieren/studieninteressierte/index.en.jsp', status: 'researching' });
  state.universities = state.universities.map(normalUniversity);
  state.exams = state.exams.map(normalExam);
  state.grades = state.grades.map(normalizeAcademicGrade);
  // Clearly labelled demo history shows the review without claiming real work.
  for (let offset = -7; offset < 0; offset++) {
    const date = shiftDate(today, offset);
    state = ensureDailyPlan(state, date);
    state.tasks = state.tasks.map((task, index) => task.date === date && index % 4 !== 0 ? { ...task, completed: true, completedAt: calendar(date).toISOString(), notes: 'Demo completion — illustrative progress only.' } : task);
  }
  return ensureDailyPlan(state, today);
}

/** The owner's supplied starting point. Unreported details remain unknown. */
export function createPersonalProfile({ today = localDateKey() } = {}) {
  const state = createInitialData({ today, demo: false });
  state.profile.academicGoalNotes = 'Englisch, schriftliche Mathematik und Deutsch verbessern; Mathematik und Physik kontinuierlich weiterentwickeln.';
  // Earlier conversations contain historical results, not current assessments.
  // A new installation starts without grades; existing saved grades never pass
  // through this starting-profile helper and are preserved by normalizeData.
  const known = { german: { weakTopics: ['Textanalyse', 'Strukturierte Argumentation'] }, english: { weakTopics: ['Writing'] }, history: {}, 'computer-science': {}, politics: {} };
  state.subjects = state.subjects.map(subject => normalSubject({
    ...subject, ...(known[subject.id] || {}),
    enabled: subject.enabled || Object.hasOwn(known, subject.id),
    baselineWritten: null, baselineOral: null,
  }));
  state.activities = [
    ['volleyball-club', 'Volleyball club', 'Sport'],
    ['restaurant-management', 'Restaurant management', 'Work / entrepreneurship'],
    ['social-media-marketing', 'Social media / marketing', 'Project'],
    ['internships', 'Internships', 'Internship'],
    ['coding-projects', 'Coding projects', 'Project'],
  ].map(([id, name, type]) => normalActivity({ id, name, type, updatedDate: today,
    notes: id === 'volleyball-club' ? 'Training Dienstag- und Freitagabend; genaue Uhrzeiten noch offen. Trage bestätigte Zeiten in deine festen Termine ein.' : '',
  }));
  state.universities = state.universities.map(university => ({
    ...university, program: '', notes: '',
    requirements: 'Check programme prerequisites and English requirements. UC does not consider SAT/ACT for admission.',
  }));
  // Training days are known, but exact hours are not. Keep that information in
  // the activity note until the owner supplies real times; never reserve made-up
  // commitments. Existing saved schedules are preserved by normalizeData.
  return state;
}

export function normalizeData(value, today = localDateKey()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createInitialData({ today, demo: false });
  if (value.version === 1) return migrateLegacy(value, today);
  const base = createInitialData({ today, demo: false });
  const subjects = uniqueRecords(value.subjects, normalSubject);
  const subjectIds = new Set(subjects.map(subject => subject.id));
  // Imported custom subjects are preserved; invalid references are not invented.
  const tasks = uniqueRecords(value.tasks, normalTask);
  const gradeIds = new Set();
  const grades = list(value.grades).map(grade => {
    const normalized = normalizeAcademicGrade(grade);
    if (!normalized || gradeIds.has(normalized.id)) return null;
    gradeIds.add(grade.id);
    return normalized;
  }).filter(Boolean).filter(grade => subjectIds.has(grade.subjectId));
  const reviews = new Map();
  for (const review of list(value.weeklyReviews, 1000)) {
    if (!isDateKey(review?.weekStart)) continue;
    const weekStart = startOfWeek(review.weekStart);
    reviews.set(weekStart, { weekStart, reflection: text(review.reflection, 4000), focusSubjectId: text(review.focusSubjectId, 150), effort: text(String(review.effort ?? ''), 100), completedAt: validStamp(review.completedAt) });
  }
  return {
    ...base, version: 2, createdDate: isDateKey(value.createdDate) ? value.createdDate : today,
    onboardingCompleted: value.onboardingCompleted === true, demo: value.demo === true,
    profile: normalProfile(value.profile), subjects: Array.isArray(value.subjects) ? subjects : base.subjects,
    exams: uniqueRecords(value.exams, normalExam), events: normalizeEvents(value.events), tasks, grades, study: normalizeStudy(value.study), ielts: normalizeIELTS(value.ielts), sat: normalizeSAT(value.sat), learning: normalizeLearning(value.learning),
    activities: uniqueRecords(value.activities, normalActivity), universities: Array.isArray(value.universities) ? uniqueRecords(value.universities, normalUniversity) : base.universities,
    schedule: normalSchedule(value.schedule), weeklyReviews: [...reviews.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    roadmapCompleted: words(value.roadmapCompleted, 300), dismissedTaskIds: words(value.dismissedTaskIds, 3000),
    legacyMilestones: uniqueRecords(value.legacyMilestones, milestone => milestone && text(milestone.id, 150) ? { id: text(milestone.id, 150), title: text(milestone.title, 300), description: text(milestone.description, 4000), category: text(milestone.category, 100), completed: milestone.completed === true } : null),
    reflections: list(value.reflections).filter(entry => isDateKey(entry?.date)).map(entry => ({ date: entry.date, achieved: text(entry.achieved, 4000), next: text(entry.next, 4000), gratitude: text(entry.gratitude, 4000), intention: text(entry.intention, 4000) })),
  };
}

/** Preserve existing tasks, custom subjects, grades and reflection journals. */
export function migrateLegacy(value, today = localDateKey()) {
  if (!value || typeof value !== 'object') return createInitialData({ today, demo: false });
  const base = createInitialData({ today, demo: false });
  const byName = new Map(base.subjects.map(subject => [subject.name.toLowerCase(), subject.id]));
  const aliases = { math: 'mathematics', maths: 'mathematics', mathematik: 'mathematics', physik: 'physics', deutsch: 'german', englisch: 'english' };
  const findSubject = name => {
    const cleaned = text(name, 150);
    if (!cleaned) return '';
    let id = aliases[cleaned.toLowerCase()] ?? byName.get(cleaned.toLowerCase());
    if (!id) {
      id = `legacy-${cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80) || uid('subject')}`;
      if (!base.subjects.some(subject => subject.id === id)) base.subjects.push({ id, name: cleaned, level: 'GK', written: null, oral: null, target: 10, weakTopics: [], enabled: true });
      byName.set(cleaned.toLowerCase(), id);
    }
    return id;
  };
  for (const name of words(value.profile?.subjects)) findSubject(name);
  const grades = list(value.grades).map(grade => ({ ...grade, subjectId: grade?.subjectId || findSubject(grade?.subject), type: grade?.type ?? 'written' }));
  const categoryMap = { languages: 'language', activities: 'activity', reflection: 'review', confidence: 'activity', wellbeing: 'review' };
  const tasks = list(value.tasks).map(task => ({ ...task, category: categoryMap[task?.category] ?? task?.category, origin: 'custom', reason: text(task?.reason) || 'Saved from your previous Northstar plan.' }));
  const profile = { ...base.profile, ...value.profile, schoolYear: text(value.profile?.schoolYear) === 'Grade 12' ? 'Q1' : value.profile?.schoolYear || 'Q1', targetFields: words(value.profile?.targetFields ?? value.profile?.major), applicationYear: value.profile?.applicationYear ?? '', academicGoalNotes: value.profile?.academicGoalNotes || value.profile?.gradeGoal || '' };
  const dailyMinutes = integer(value.profile?.dailyMinutes, 60, 0, 720);
  const milestoneMap = {
    'academic-baseline': ['USA-now-baseline', 'Germany-now-baseline'], 'coursework-requirements': ['USA-q1-requirements'],
    'grade-habit': ['Germany-q1-routine'], 'language-habit': ['USA-q1-english', 'Germany-q1-language'],
    'experience-record': ['USA-q1-activities'], 'personal-insight': ['USA-q3-essays'], 'application-calendar': ['USA-q3-calendar'],
  };
  const roadmapCompleted = list(value.milestones).filter(item => item?.completed).flatMap(item => milestoneMap[item.id] || []);
  let migrated = normalizeData({ ...base, version: 2, onboardingCompleted: true, demo: false, profile, subjects: base.subjects, tasks, grades, reflections: value.reflections, legacyMilestones: value.milestones, schedule: { ...base.schedule, weekly: base.schedule.weekly.map(day => ({ ...day, minutes: dailyMinutes })) }, roadmapCompleted }, today);
  for (const key of new Set(migrated.grades.map(grade => `${grade.subjectId}::${grade.type}`))) {
    const [subjectId, type] = key.split('::');
    migrated = recomputeGrades(migrated, subjectId, type);
  }
  return migrated;
}

export function getAvailability(state, date) {
  const day = calendar(date).getDay();
  const schedule = normalSchedule(state.schedule);
  const weekly = schedule.weekly.find(entry => entry.day === day);
  const start = clockMinutes(weekly.windowStart);
  const end = clockMinutes(weekly.windowEnd);
  const blocks = [...schedule.fixedActivities.filter(event => event.date ? event.date === date : event.days.includes(day)), ...lessonBlocks({ ...state, schedule }, date)].sort((a, b) => a.start.localeCompare(b.start));
  const busy = blocks.map(block => [Math.max(start, clockMinutes(block.start)), Math.min(end, clockMinutes(block.end))]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const block of busy) {
    if (merged.length && block[0] <= merged.at(-1)[1]) merged.at(-1)[1] = Math.max(merged.at(-1)[1], block[1]);
    else merged.push([...block]);
  }
  const freeWindows = [];
  let cursor = start;
  for (const [a, b] of merged) {
    if (a > cursor) freeWindows.push({ start: clock(cursor), end: clock(a), minutes: a - cursor });
    cursor = Math.max(cursor, b);
  }
  if (end > cursor) freeWindows.push({ start: clock(cursor), end: clock(end), minutes: end - cursor });
  const override = schedule.timeOverrides.find(entry => entry.date === date);
  const usable = freeWindows.reduce((sum, window) => sum + window.minutes, 0);
  return { availableMinutes: Math.min(override?.minutes ?? weekly.minutes, usable), freeWindows, blocks };
}

function currentGrade(subject) {
  const values = [subject.written, subject.oral].filter(value => typeof value === 'number' && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function subjectGap(subject) {
  const current = currentGrade(subject);
  const weakestRecorded = [subject.written, subject.oral].filter(value => typeof value === 'number' && Number.isFinite(value));
  return current === null ? 1 : Math.max(0, subject.target - Math.min(...weakestRecorded));
}
function subjectFor(state, id) { return state.subjects.find(subject => subject.id === id); }
const subjectLabel = subject => ({ mathematics: 'Mathematik', physics: 'Physik', english: 'Englisch', german: 'Deutsch', history: 'Geschichte', politics: 'Politik / Wirtschaft', 'computer-science': 'Informatik' }[subject?.id] || subject?.name || 'Fach');
function languageKind(subject) {
  if (/english|englisch/i.test(subject?.name ?? '')) return 'english';
  if (/german|deutsch/i.test(subject?.name ?? '')) return 'german';
  return '';
}
function scienceKind(subject) { return /math|physic|physik|computer|informatik|chem/i.test(subject?.name ?? ''); }

/** Revision milestones depend on discipline, exam format and the remaining time. */
export function getExamPlan(state, examId, today = localDateKey()) {
  const exam = state.exams.find(item => item.id === examId);
  if (!exam) return [];
  calendar(today);
  const subject = subjectFor(state, exam.subjectId);
  const name = subjectLabel(subject);
  const provisional = !exam.topics.length;
  const topic = exam.topics[0] || 'die noch zu bestätigenden Prüfungsthemen';
  const language = languageKind(subject);
  let templates;
  if (exam.format === 'oral') {
    templates = [
      ['understand', 14, `Begriffsnetz zu ${topic} erstellen`, 'Ordne die Kernideen und erkläre ihre Zusammenhänge ohne Unterlagen.', 25],
      ['explain', 10, `${topic} laut erklären`, 'Nimm eine zweiminütige Erklärung auf und prüfe Verständlichkeit und fehlende Inhalte.', 20],
      ['questions', 7, `Rückfragen in ${name} beantworten`, 'Formuliere sechs mögliche Rückfragen und übe begründete Antworten.', 25],
      ['timed', 4, `Eine mündliche ${name}-Probe unter Zeitdruck durchführen`, 'Bereite zeitgebunden vor, trage laut vor und bitte um Feedback.', 30],
      ['mistakes', 2, 'Unklare Erklärungen verbessern', 'Gehe Fehler aus der Probe durch und erkläre die korrigierten Zusammenhänge.', 20],
      ['light', 1, 'Mündlich leicht wiederholen', 'Wiederhole Stichwortkarten kurz. Höre früh auf und schütze deinen Schlaf.', 15],
    ];
  } else if (exam.format === 'practical') {
    templates = [
      ['understand', 14, `Das Vorgehen zu ${topic} verstehen`, 'Notiere Ziel, Hilfsmittel, Sicherheitsregeln und erwartete Beobachtungen.', 25],
      ['practice', 10, `Das praktische ${name}-Vorgehen üben`, 'Nutze erlaubte Hilfsmittel oder eine schriftliche Simulation und halte jeden Schritt fest.', 30],
      ['interpret', 7, `Ergebnisse in ${name} deuten`, 'Lies Ergebnisse, erkläre Unsicherheit und formuliere eine gestützte Schlussfolgerung.', 25],
      ['timed', 4, `Eine praktische ${name}-Probe unter Zeitdruck durchführen`, 'Übe den geforderten Ablauf unter realistischen Bedingungen und angemessener Aufsicht.', 35],
      ['mistakes', 2, 'Ablauf- und Deutungsfehler korrigieren', 'Verbessere den schwächsten Schritt und erkläre, warum die richtige Methode funktioniert.', 20],
      ['light', 1, 'Den praktischen Ablauf leicht wiederholen', 'Gehe deine Ablaufcheckliste durch und lege benötigte Hilfsmittel bereit.', 15],
    ];
  } else if (language) {
    templates = [
      ['understand', 14, `Kontext und Themen zu ${topic} verbinden`, 'Erstelle eine einseitige Übersicht und wähle drei passende Beispiele.', 25],
      ['summary', 10, `${name}: einen Zusammenfassungsabsatz schreiben`, 'Lies einen kurzen Abschnitt. Fasse sachlich in eigenen Worten zusammen und prüfe die Zeitform.', 25],
      ['analysis', 7, `${name}: einen Analyseabsatz aufbauen`, 'Formuliere eine Deutung, belege sie am Text und erkläre Sprache, Wirkung und Absicht.', 30],
      ['timed', 4, `Eine ${name}-Prüfungsaufgabe unter Zeitdruck bearbeiten`, 'Übe das tatsächliche Prüfungsformat und gleiche deinen Versuch mit den Bewertungskriterien ab.', 40],
      ['mistakes', 2, `${name}: dein Fehlerprotokoll überarbeiten`, 'Schreibe deinen schwächsten Absatz neu und prüfe wiederkehrende Grammatikfehler.', 20],
      ['light', 1, `${name}: leicht wiederholen`, 'Wiederhole Aufbau und Schlüsselbegriffe. Beginne jetzt keinen vollständigen neuen Aufsatz.', 15],
    ];
  } else if (scienceKind(subject)) {
    templates = [
      ['understand', 14, `Die Methode zu ${topic} verstehen`, 'Erkläre das Grundprinzip und bearbeite ein kommentiertes Beispiel.', 25],
      ['practice', 10, `Drei ${name}-Aufgaben lösen`, 'Rechne zuerst ohne Lösungsblatt. Zeige Begründungen, Einheiten und jeden Schritt.', 30],
      ['mixed', 7, `Gemischte ${name}-Aufgaben bearbeiten`, 'Mische Aufgabentypen, damit du die passende Methode selbst auswählen musst.', 30],
      ['timed', 4, `Eine ${name}-Probeklausur unter Zeitdruck bearbeiten`, 'Nutze Prüfungsbedingungen und korrigiere mit einer Lösung oder den Kriterien deiner Lehrkraft.', 40],
      ['mistakes', 2, `${name}: Fehleraufgaben erneut lösen`, 'Löse die früher falschen Aufgaben erneut, bis du die korrigierte Methode erklären kannst.', 25],
      ['light', 1, `${name}: Formeln und Konzepte leicht wiederholen`, 'Wiederhole eine kurze Formel- und Begriffsübersicht und lege Hilfsmittel bereit.', 15],
    ];
  } else {
    templates = [
      ['understand', 14, `Kernideen zu ${topic} ordnen`, 'Verbinde Fakten, Ursachen und Beispiele in einem kurzen Begriffsnetz.', 25],
      ['recall', 10, `${name}: wichtige Belege abrufen`, 'Rufe Kernideen ohne Notizen ab. Prüfe danach Lücken und die Genauigkeit deiner Belege.', 25],
      ['argument', 7, `Ein belegtes Argument in ${name} entwickeln`, 'Gliedere eine Antwort mit Aussage, präzisen Belegen und Bewertung.', 30],
      ['timed', 4, `Eine ${name}-Antwort unter Zeitdruck schreiben`, 'Übe dein Prüfungsformat und vergleiche deine Antwort mit den bekannten Bewertungskriterien.', 35],
      ['mistakes', 2, `${name}: schwache Antworten überarbeiten`, 'Korrigiere Auslassungen, unklare Begründungen und schwache Belege in bisherigen Antworten.', 20],
      ['light', 1, `${name}: Kernideen leicht wiederholen`, 'Wiederhole kurze Stichwortkarten und erhole dich vor der Prüfung.', 15],
    ];
  }
  if (exam.format === 'test') templates = templates.filter(([stage]) => !['mixed', 'analysis', 'argument'].includes(stage));
  const anchor = isDateKey(exam.createdDate) ? exam.createdDate : state.createdDate;
  const created = isDateKey(anchor) && anchor < exam.date ? anchor : shiftDate(exam.date, -14);
  const horizon = Math.max(1, daysBetween(created, exam.date));
  const maxOffset = Math.min(14, horizon);
  if (horizon <= 3) templates = templates.filter(([stage]) => ['understand', 'practice', 'summary', 'explain', 'recall', 'light'].includes(stage));
  else if (horizon <= 7) templates = templates.filter(([stage]) => !['mixed', 'analysis', 'argument', 'questions', 'interpret', 'mistakes'].includes(stage));
  return templates.map(([stage, offset, title, reason, minutes], index) => {
    // Short-notice exams compress the plan, without inventing study in the past.
    const adaptedOffset = horizon <= 3 ? stage === 'light' ? 1 : horizon : Math.min(offset, maxOffset);
    const id = `revision-${exam.id}-${stage}`;
    const requiredMinutes = horizon <= 3 && stage !== 'light' ? Math.min(stage === 'understand' ? 15 : 20, minutes) : minutes;
    const work = state.tasks.filter(task => task.completed && task.examId === exam.id && (task.revisionPlanId === id || task.revisionStage === stage));
    // A short part of an exercise is useful work, but it is not a full revision
    // milestone. A timed paper additionally requires one uninterrupted session.
    const credited = stage === 'timed'
      ? work.reduce((max, task) => Math.max(max, Math.min(task.minutes, task.sessions?.length ? Math.max(...task.sessions.map(session => clockMinutes(session.end) - clockMinutes(session.start))) : task.minutes)), 0)
      : work.reduce((sum, task) => sum + task.minutes, 0);
    const completedMinutes = Math.min(requiredMinutes, credited);
    const completed = completedMinutes >= requiredMinutes;
    const remainingMinutes = stage === 'timed' && !completed ? requiredMinutes : Math.max(0, requiredMinutes - completedMinutes);
    return { id, date: shiftDate(exam.date, -adaptedOffset), title: text(title, 300), minutes: requiredMinutes, requiredMinutes, completedMinutes, remainingMinutes, stage, completed, provisional, reason: text(`${provisional ? 'Vorläufig: Prüfungsthemen fehlen. Bestätige sie zuerst mit deiner Lehrkraft. ' : ''}${reason}`, 1200), order: index };
  });
}

function weeklyBoost(state, date) {
  const previousStart = shiftDate(startOfWeek(date), -7);
  const review = state.weeklyReviews.find(item => item.weekStart === previousStart);
  if (review?.focusSubjectId) return { subjectId: review.focusSubjectId, reason: 'Dein Wochenrückblick hat dieses Fach als Schwerpunkt festgelegt.' };
  const previous = state.tasks.filter(task => task.date >= previousStart && task.date <= shiftDate(previousStart, 6) && task.subjectId);
  const bySubject = new Map();
  for (const task of previous) {
    const entry = bySubject.get(task.subjectId) || { planned: 0, completed: 0 };
    entry.planned++;
    if (task.completed) entry.completed++;
    bySubject.set(task.subjectId, entry);
  }
  const weakest = [...bySubject].filter(([, counts]) => counts.planned >= 2 && counts.completed / counts.planned < .7).sort((a, b) => (a[1].completed / a[1].planned) - (b[1].completed / b[1].planned))[0];
  return weakest ? { subjectId: weakest[0], reason: 'Letzte Woche hast du für dieses Fach weniger Übung abgeschlossen. Heute gelingt der Einstieg mit einer kürzeren Einheit.' } : null;
}

function weeklyLoad(state, date, availableMinutes) {
  const previousStart = shiftDate(startOfWeek(date), -7);
  const review = state.weeklyReviews.find(item => item.weekStart === previousStart);
  const requested = text(review?.effort, 100).toLowerCase();
  const effort = ['lighter', 'more'].includes(requested) ? requested : 'same';
  // A lighter week should still offer one useful action on a five-minute day.
  // Below that minimum the normal allocator keeps the day free of new work.
  const lighterBudget = Math.min(availableMinutes, Math.max(availableMinutes >= 5 ? 5 : 0, Math.floor(availableMinutes * .8)));
  return { effort, budget: effort === 'lighter' ? lighterBudget : availableMinutes };
}
function candidate(key, title, category, minutes, score, reason, extra = {}) {
  return { key, category, minutes, score, priority: score >= 80 ? 'high' : score >= 40 ? 'medium' : 'low', ...extra, title: text(title, 300), reason: text(reason, 1200), steps: words(extra.steps, 12), resource: text(extra.resource, 1000) };
}
function makeCandidates(state, date) {
  const candidates = [];
  const subjectPriorities = new Map(getSubjectPriorities(state, date).map(item => [item.subjectId, item]));
  const graduated = state.profile.schoolYear === 'Graduated';
  const ordinal = Math.floor(Date.UTC(...date.split('-').map((value, i) => i === 1 ? Number(value) - 1 : Number(value))) / DAY);
  const boost = weeklyBoost(state, date);
  // Today's completions update progress, but must not refill today's plan with
  // the next revision stage. They influence the next calendar day's plan.
  const priorCompletionState = { ...state, tasks: state.tasks.map(task => task.completed && completionDate(task) >= date ? { ...task, completed: false } : task) };
  for (const exam of state.exams) {
    const until = daysBetween(date, exam.date);
    const subject = subjectFor(state, exam.subjectId);
    if (until < 1 || until > 45 || subject?.enabled === false) continue;
    const context = exam.topics.length ? [`Bearbeite den bestätigten Prüfungskontext: ${exam.topics.join(', ')}.`] : ['Vorläufiger Plan: Bestätige zuerst die tatsächlichen Prüfungsthemen; ein schwaches Unterrichtsthema ist noch kein bestätigter Prüfungsinhalt.'];
    const plan = getExamPlan(priorCompletionState, exam.id, date);
    const incomplete = plan.filter(step => !step.completed);
    if (!incomplete.length) continue;
    const due = incomplete.filter(step => step.date <= date);
    const foundation = incomplete.find(step => step.stage === 'understand');
    const next = until === 1 ? due.find(step => step.stage === 'light') || due.at(-1) : foundation || due.at(-1) || null;
    const score = Math.max((until <= 3 ? 165 : until <= 7 ? 140 : until <= 14 ? 112 : until <= 21 ? 83 : 55) + subjectGap(subject || { target: 10 }) * 3, subjectPriorities.get(exam.subjectId)?.score || 0) + (exam.importance === 'high' ? 12 : exam.importance === 'low' ? -5 : 0) + (boost?.subjectId === exam.subjectId ? 15 : 0);
    if (next) {
      candidates.push(candidate(`exam-${exam.id}-${next.stage}`, next.title, languageKind(subject) ? 'language' : 'academics', Math.max(5, next.remainingMinutes || next.minutes), score,
        `${exam.title} ist in ${until} Tag${until === 1 ? '' : 'en'}. ${next.reason}`, { subjectId: exam.subjectId, examId: exam.id, revisionStage: next.stage, revisionPlanId: next.id, goalId: 'grades', steps: [...context, next.reason, 'Speichere einen Fehler oder eine Erkenntnis in deinen Aufgabennotizen.'] }));
      if (plan.length <= 3 && until > 1 && next.stage === 'understand') {
        const followUp = incomplete.find(step => step.stage !== 'understand' && step.stage !== 'light' && step.date <= date);
        if (followUp) candidates.push(candidate(`exam-${exam.id}-${followUp.stage}`, followUp.title, languageKind(subject) ? 'language' : 'academics', Math.max(5, followUp.remainingMinutes || followUp.minutes), score - 1,
          `Diese kurzfristige Prüfung ist in ${until} Tagen. Übe nach dem Grundverständnis ein kleines Beispiel.`, { subjectId: exam.subjectId, examId: exam.id, revisionStage: followUp.stage, revisionPlanId: followUp.id, goalId: 'grades', steps: [...context, followUp.reason, 'Wähle eine kurze Aufgabe und prüfe die Lösung sorgfältig.'] }));
      }
    } else {
      const topic = exam.topics[ordinal % Math.max(1, exam.topics.length)] || 'die noch zu bestätigenden Prüfungsthemen';
      candidates.push(candidate(`exam-${exam.id}-maintenance`, `${subjectLabel(subject)}: ${topic} festigen`, languageKind(subject) ? 'language' : 'academics', 20, score - 12,
        `${exam.title} ist in ${until} Tagen. Die Grundlagen sind bearbeitet. Übe weiter; Probedurchlauf und leichte Wiederholung bleiben nah an der Prüfung. Nächster Vorbereitungsschritt: ${incomplete[0].date}.`,
        { subjectId: exam.subjectId, examId: exam.id, goalId: 'grades', steps: [...context, ...(languageKind(subject) ? ['Schreibe einen Absatz mit aktuellem Prüfungsmaterial.', 'Verbessere Aufbau und Belege anhand deiner Unterrichtskriterien.'] : ['Erkläre das Grundprinzip ohne Notizen.', 'Löse zwei passende Fragen und prüfe deine Methode.'])] }));
    }
  }
  for (const subject of state.subjects.filter(subject => subject.enabled && (!graduated || languageKind(subject)))) {
    if (candidates.some(item => item.examId && item.subjectId === subject.id)) continue;
    const topic = subject.weakTopics[ordinal % Math.max(1, subject.weakTopics.length)] || (graduated ? 'wissenschaftsnahes Schreiben' : 'den unklarsten Inhalt der letzten Stunde');
    const gap = subjectGap(subject);
    const academic = calculateSubject(state, subject.id);
    const grade = academic.average;
    const components = `${typeof subject.written === 'number' ? `Schriftlich ${subject.written} Punkte` : 'Schriftliche Punkte offen'}; ${typeof subject.oral === 'number' ? `mündlich ${subject.oral} Punkte` : 'mündliche Punkte offen'}.`;
    const weakComponent = typeof subject.written === 'number' && subject.written < subject.target && (typeof subject.oral !== 'number' || subject.written <= subject.oral) ? `Deine schriftliche Leistung soll sich in Richtung ${subject.target} Punkte verbessern.` : typeof subject.oral === 'number' && subject.oral < subject.target ? `Deine mündliche Leistung soll sich in Richtung ${subject.target} Punkte verbessern.` : '';
    const language = languageKind(subject);
    const score = (subjectPriorities.get(subject.id)?.score ?? 48 + gap * 8 + (subject.level === 'LK' ? 8 : 0)) + (boost?.subjectId === subject.id ? 35 : 0) + (language ? (ordinal % 2 === (language === 'english' ? 0 : 1) ? 6 : 0) : 0);
    const title = language ? `${subjectLabel(subject)}: ${topic} gezielt verbessern` : `${subjectLabel(subject)}: ${topic} üben`;
    candidates.push(candidate(`subject-${subject.id}`, title, language ? 'language' : 'academics', boost?.subjectId === subject.id ? 20 : 25, score,
      `${graduated ? 'Stärke klares wissenschaftsnahes Schreiben für Studium und Bewerbungen.' : grade === null ? academic.records.length ? academic.reason : 'Kläre deinen aktuellen Lernstand vor der nächsten Leistung.' : `${components} ${academic.methodLabel}: ${grade.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Punkte; ${subject.target === null ? 'Ziel noch offen' : `Ziel ${subject.target}`}. ${weakComponent}`}${boost?.subjectId === subject.id ? ` ${boost.reason}` : ''}`,
      { subjectId: subject.id, goalId: language ? 'language' : 'grades', steps: language ? [`Schreibe einen klar gegliederten Absatz mit ${graduated ? 'deinem aktuellen Übungsmaterial' : 'deinem Unterrichtsmaterial'}.`, 'Prüfe Aufbau, Grammatik und Genauigkeit. Verbessere einen Satz.'] : ['Erkläre den Gedanken aus dem Gedächtnis.', 'Bearbeite zwei passende Übungsfragen und korrigiere deine Fehler.'] }));
  }
  const languageId = ordinal % 2 === 0 ? 'english' : 'german';
  const languageSubject = state.subjects.find(subject => languageKind(subject) === languageId && subject.enabled);
  const languageName = languageId === 'english' ? 'Englisch' : 'Deutsch';
  const languageLevel = languageId === 'english' ? state.profile.englishLevel : state.profile.germanLevel;
  if (!candidates.some(item => item.category === 'language' && item.score > 105)) {
    const beginner = /^A[12]$/i.test(languageLevel);
    const advanced = /^C[12]$/i.test(languageLevel) || /native/i.test(languageLevel);
    const count = beginner ? 4 : advanced ? 12 : 8;
    candidates.push(candidate(`vocabulary-${languageId}`, `${languageName}: ${count} ${beginner ? 'alltagstaugliche' : 'präzise'} Wörter aktiv anwenden`, 'language', 10, 47,
      `Baue Wortschatz auf, den du beim ${graduated ? 'wissenschaftsnahen' : 'schulischen'} Schreiben aktiv verwenden kannst. Übe eigene Sätze und Abrufen statt nur eine lange Liste.`,
      { subjectId: languageSubject?.id || '', goalId: 'language', steps: [`Wähle ${count} ${beginner ? 'häufige Wörter aus einem kurzen, gut verständlichen Text' : 'unbekannte Wörter aus deinem aktuellen Unterrichtstext'}.`, `Schreibe ${beginner ? '2 kurze' : advanced ? '5 präzise' : '4 eigene'} Sätze und rufe die Wörter ohne Nachschlagen ab.`] }));
  }
  // The calendar owns test, internship, project and application preparation;
  // exams retain the subject-specific revision model above.
  const ieltsSummary = getIELTSSummary(state, date);
  const dedicatedIELTS = ieltsSummary.data.enabled && ieltsSummary.configured;
  const olderIELTSEvents = new Set((state.profile.testPlans || []).filter(test => /ielts/i.test(test.name)).map(test => `test:${test.id}`));
  const satSummary = getSATSummary(state, date);
  const dedicatedSAT = satSummary.data.enabled && satSummary.configured;
  const olderSATEvents = new Set((state.profile.testPlans || []).filter(test => /\bsat\b/i.test(test.name)).map(test => `test:${test.id}`));
  candidates.push(...getEventCandidates(priorCompletionState, date).filter(item => item.eventStage === 'research' || ((!dedicatedIELTS || !olderIELTSEvents.has(item.eventId)) && (!dedicatedSAT || !olderSATEvents.has(item.eventId)))));
  const lastIELTS = priorCompletionState.tasks.filter(task => task.completed && task.ieltsSkill && completionDate(task) < date).map(completionDate).sort().at(-1);
  const ieltsCadence = !lastIELTS || daysBetween(lastIELTS, date) >= 3 ? 25 : daysBetween(lastIELTS, date) >= 2 ? 15 : 0;
  const majorSchoolExamSoon = state.exams.some(exam => daysBetween(date, exam.date) >= 0 && daysBetween(date, exam.date) <= 2 && subjectFor(state, exam.subjectId)?.enabled);
  for (const item of getIELTSCandidates(priorCompletionState, date)) {
    const adjustedMinutes = majorSchoolExamSoon ? Math.min(15, item.minutes) : item.minutes;
    candidates.push(candidate(item.key, item.title, 'language', adjustedMinutes, item.score + (majorSchoolExamSoon ? 0 : ieltsCadence), `${item.reason}${ieltsCadence && !majorSchoolExamSoon ? ' Eine regelmäßige kurze IELTS-Einheit hält deine Vorbereitung auch vor der letzten Prüfungsphase in Gang.' : ''}`, {
      ...item, category: 'language', subjectId: state.subjects.find(subject => languageKind(subject) === 'english' && subject.enabled)?.id || '', goalId: 'language',
      score: item.score + (majorSchoolExamSoon ? 0 : ieltsCadence), minutes: adjustedMinutes,
      steps: item.steps.map(step => typeof step === 'string' ? step : `${step.title}${step.minutes ? ` · ${step.minutes} Min.` : ''}: ${step.instruction}`),
      resource: typeof item.resource === 'string' ? item.resource : item.resource?.url || '',
    }));
  }
  // School, language tests and profile work draw from the same allowance.
  // A joint daily cap below prevents parallel test plans from overloading it.
  const lastSAT = priorCompletionState.tasks.filter(task => task.completed && task.satSkill && completionDate(task) < date).map(completionDate).sort().at(-1);
  const satCadence = !lastSAT || daysBetween(lastSAT, date) >= 3 ? 20 : daysBetween(lastSAT, date) >= 2 ? 10 : 0;
  for (const item of getSATCandidates(priorCompletionState, date)) {
    candidates.push(candidate(item.key, item.title, 'language', majorSchoolExamSoon ? Math.min(15, item.minutes) : item.minutes, item.score + (majorSchoolExamSoon ? 0 : satCadence), item.reason, {
      ...item, category: 'language', subjectId: '', goalId: 'tests',
      score: item.score + (majorSchoolExamSoon ? 0 : satCadence), minutes: majorSchoolExamSoon ? Math.min(15, item.minutes) : item.minutes,
      steps: item.steps.map(step => typeof step === 'string' ? step : `${step.title}${step.minutes ? ` · ${step.minutes} Min.` : ''}: ${step.instruction}`),
      resource: typeof item.resource === 'string' ? item.resource : item.resource?.url || '',
    }));
  }
  for (const review of getLearningReviews(state, date).slice(0, 2)) {
    const subject = subjectFor(state, review.subjectId);
    if (!subject?.enabled || (graduated && !languageKind(subject))) continue;
    candidates.push(candidate(`learning-review-${review.id}`, `${subject.name}: einen früheren Fehler erneut lösen`, languageKind(subject) ? 'language' : 'academics', 15, 82,
      'Die kurze Wiederholung ist fällig. Prüfe, ob du den gespeicherten Fehler jetzt selbstständig vermeiden kannst.', {
        subjectId: review.subjectId, learningTopic: review.topic, goalId: languageKind(subject) ? 'language' : 'grades', reviewDate: date,
        steps: ['Erkläre den gespeicherten Fehler ohne die Lösung anzusehen.', 'Bearbeite die Aufgabe noch einmal und prüfe den Unterschied.', 'Bewerte ehrlich, ob der nächste Abstand kurz oder länger sein soll.'],
      }));
  }
  const priorities = getRoadmapPriorities(priorCompletionState, date);
  const seenActions = new Set();
  for (const milestone of priorities) {
    const action = milestone.nextStep;
    if (milestone.category === 'academics' && graduated) continue;
    if (milestone.category === 'academics' && !state.subjects.some(subject => subject.enabled)) continue;
    if (seenActions.has(action.title)) continue;
    seenActions.add(action.title);
    // Concrete setup actions remain distinct from ongoing subject practice,
    // and should not displace more urgent actual assessments.
    const timing = milestone.dateVerified ? `Gespeicherte Bewerbungsfrist ${milestone.dueDate}. Prüfe sie anhand der offiziellen Quelle.` : `${milestone.pathway} · ${milestone.phaseLabel}: Planungsziel ${milestone.dueDate}, keine bestätigte Bewerbungsfrist.`;
    candidates.push(candidate(`roadmap-${milestone.id}-${action.id.split('-').at(-1)}`, action.title, milestone.category, Math.max(5, action.remainingMinutes), milestone.score,
      `${timing} ${milestone.description}`, { goalId: milestone.goalId, roadmapItemId: milestone.id, roadmapStepId: action.id, linkedGoal: `${milestone.pathway} · ${milestone.title}`, resource: milestone.link,
        steps: action.instructions, roadmapAction: true }));
  }
  // A periodic maintenance action records new real achievements without a
  // daily generic profile task. Actual edits and prior completions defer it.
  const documentationMilestone = priorities.find(item => item.milestoneCategory === 'extracurriculars' && item.id.includes('q1-activities'))
    || [...state.profile.pathways].flatMap(path => getRoadmap(state, path, date).flatMap(phase => phase.items)).find(item => ['extracurriculars', 'internships'].includes(item.category));
  const recentActivities = priorCompletionState.tasks.filter(task => task.category === 'activity' && task.completed).map(completionDate).filter(Boolean).sort();
  const lastActivityCompletion = recentActivities.at(-1);
  const update = state.activities.filter(activity => (!activity.updatedDate || daysBetween(activity.updatedDate, date) >= 7) && (!activity.endDate || daysBetween(activity.endDate, date) <= 30))
    .sort((a, b) => (a.updatedDate || '').localeCompare(b.updatedDate || '') || a.id.localeCompare(b.id))[0];
  if (update && (!lastActivityCompletion || daysBetween(lastActivityCompletion, date) >= 7)) {
    candidates.push(candidate(`activity-impact-${update.id}`, `${update.name}: einen konkreten Beitrag festhalten`, 'activity', 15, update.impact ? 40 : 58,
      'Ein gelegentlicher Erfahrungsrückblick hält dein Bewerbungsprofil aktuell. Erfasse echte Verantwortung, Ergebnisse und Belege.',
      { goalId: 'activities', roadmapItemId: documentationMilestone?.id || '', linkedGoal: documentationMilestone ? `${documentationMilestone.pathway} · ${documentationMilestone.title}` : 'Ein ehrliches, langfristiges Bewerbungsprofil aufbauen', steps: ['Notiere, was du seit der letzten Aktualisierung selbst gemacht hast.', 'Aktualisiere tatsächliche Daten, Verantwortung, Ergebnisse und Wirkung unter Aktivitäten.'] }));
  }
  // Every academic and calendar action explains the relevant long-term goal,
  // including continued subject practice after a roadmap action is finished.
  for (const item of candidates) {
    if (item.roadmapItemId) continue;
    const allMilestones = state.profile.pathways.flatMap(path => getRoadmap(priorCompletionState, path, date).flatMap(phase => phase.items));
    const subject = subjectFor(state, item.subjectId);
    const practiceLanguage = languageKind(subject) || (item.key.startsWith('vocabulary-') ? item.key.slice('vocabulary-'.length) : '');
    const practiceMilestones = practiceLanguage ? allMilestones.filter(milestone => milestone.category === practiceLanguage)
      : item.subjectId ? allMilestones.filter(milestone => milestone.category === 'grades' && !milestone.id.endsWith('now-baseline')) : [];
    const practiceParent = practiceMilestones.find(milestone => milestone.planningStart <= date && milestone.dueDate >= date && !milestone.completed)
      || practiceMilestones.find(milestone => milestone.planningStart <= date && milestone.dueDate >= date)
      || [...practiceMilestones].reverse().find(milestone => milestone.planningStart <= date)
      || practiceMilestones[0];
    const preferred = practiceParent || priorities.find(milestone => milestone.goalId === item.goalId)
      || allMilestones.find(milestone => !milestone.completed && milestone.goalId === item.goalId && milestone.planningStart <= date)
      || allMilestones.find(milestone => milestone.goalId === item.goalId);
    if (preferred) { item.roadmapItemId = preferred.id; item.linkedGoal = `${preferred.pathway} · ${preferred.title}`; }
    else item.linkedGoal = item.category === 'review' ? 'Die nächste Woche an deinen Studienzielen ausrichten' : 'Die schulische Grundlage fürs Studium stärken';
  }
  if (calendar(date).getDay() === 0) {
    candidates.push(candidate('weekly-review', 'Deine Woche auswerten und einen Schwerpunkt wählen', 'review', 10, 110,
      'Ein kurzer Sonntagsrückblick passt die nächste Woche an, ohne einen Aufgabenstau aufzubauen.', { goalId: 'review', linkedGoal: 'Einen tragfähigen Weg von Q1 bis zum Studium aufbauen', steps: ['Öffne Fortschritt und sieh dir deine abgeschlossene Arbeit an.', 'Speichere deinen Wochenrückblick und wähle ein Fach mit besonderem Bedarf.'] }));
  }
  return candidates.map(item => {
    if (!['academics', 'language'].includes(item.category) || item.roadmapAction) return item;
    return { ...item, ...getTaskLearningMetadata(item, state, date) };
  }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

function hasTutorWork(state, task) {
  const session = state.learning?.sessions?.find(item => item.taskId === task.id);
  return !!(session && (session.startedAt || session.completedAt || Object.values(session.answers || {}).some(answer => typeof answer === 'string' && answer.trim())));
}

export function ensureDailyPlan(state, date, referenceDate = date) {
  calendar(date);
  calendar(referenceDate);
  // History is a record of what was actually planned. New settings may change
  // future recommendations, but must not rewrite a past day's workload.
  if (date < referenceDate || date < state.createdDate) return state;
  const dismissed = new Set(state.dismissedTaskIds || []);
  // A saved draft that could not fit was parked rather than deliberately
  // skipped. Reconsider it when the allowance changes, without duplicating
  // its stable ID or losing the writing attached to it.
  const existing = state.tasks.filter(task => task.date === date && (!task.skipped || (task.origin === 'generated' && !dismissed.has(task.id) && (task.notes?.trim() || task.selfReview?.length || hasTutorWork(state, task)))));
  const signature = planSignature(state, date);
  const oldGenerated = existing.filter(task => task.origin === 'generated');
  if (oldGenerated.length && oldGenerated.every(task => task.planSignature === signature)) return state;
  // A running or paused focus session keeps its original task and exercise
  // duration even when an exam, grade or timetable changes mid-session.
  const activeTaskId = state.study?.active?.taskId;
  // Saved writing and review answers are work already started. Reprioritising
  // an exam or timetable must not silently throw that work away.
  const availableCandidates = makeCandidates(state, date);
  const retained = existing.filter(task => task.origin === 'custom' || task.completed || task.id === activeTaskId);
  const drafts = existing.filter(task => task.origin === 'generated' && !task.completed && task.id !== activeTaskId && (task.notes?.trim() || task.selfReview?.length || hasTutorWork(state, task))).map(task => {
    const updated = availableCandidates.find(item => `plan-${date}-${item.key}` === task.id);
    // Keep the action and its writing stable, while allowing a corrected goal
    // link from an engine upgrade to replace obsolete metadata.
    return { task: updated ? { ...task, roadmapItemId: updated.roadmapItemId || '', roadmapStepId: updated.roadmapStepId || '', linkedGoal: updated.linkedGoal || '', goalId: updated.goalId || '', planSignature: signature } : { ...task, planSignature: signature }, requestedMinutes: Math.max(task.minutes, updated?.minutes || 0), score: updated?.score || 0 };
  }).sort((a, b) => b.score - a.score || a.task.id.localeCompare(b.task.id));
  const previous = new Map(existing.map(task => [task.id, task]));
  const availability = getAvailability(state, date);
  const load = weeklyLoad(state, date, availability.availableMinutes);
  const retainedMinutes = retained.reduce((sum, task) => sum + task.minutes, 0);
  let budget = Math.max(0, load.budget - retainedMinutes);
  const maxTasks = load.budget >= 120 ? 5 : load.budget >= 60 ? 4 : load.budget >= 30 ? 3 : Math.max(1, Math.floor(load.budget / 10));
  const targetCount = Math.min(5, maxTasks + (load.effort === 'more' && load.budget >= 50 ? 1 : 0));
  const parked = [];
  for (const { task, requestedMinutes } of drafts) {
    if (budget < 5 || retained.length >= targetCount) {
      parked.push({ ...task, skipped: true, sessions: [], start: '', end: '' });
      continue;
    }
    // Started writing deserves a place, but does not freeze the old duration
    // after a busy day reduces the available time.
    if (task.satSkill === 'full' && (budget < requestedMinutes || !placeTasks([...retained, task], availability.freeWindows).at(-1)?.sessions.some(session => clockMinutes(session.end) - clockMinutes(session.start) >= 144))) {
      parked.push({ ...task, skipped: true, sessions: [], start: '', end: '' });
      continue;
    }
    const minutes = Math.min(requestedMinutes, budget);
    retained.push({ ...task, minutes, ...(task.skipped !== undefined ? { skipped: false } : {}), steps: minutes < requestedMinutes ? words(['Nutze diese kurze Einheit für einen kleinen Teil der Aufgabe.', ...task.steps], 12) : task.steps });
    budget -= minutes;
  }
  const completedKeys = new Set(retained.map(task => task.id));
  const parkedKeys = new Set(parked.map(task => task.id));
  const candidates = availableCandidates.filter(item => !completedKeys.has(`plan-${date}-${item.key}`) && !parkedKeys.has(`plan-${date}-${item.key}`) && !dismissed.has(`plan-${date}-${item.key}`));
  const picked = [];
  const remainingCount = Math.max(0, targetCount - retained.length);
  // Make the first two actions the most urgent, then keep breadth where urgency allows.
  for (const item of candidates) {
    if (picked.length >= remainingCount || budget < 5) break;
    if ((item.ieltsSkill || item.satSkill) && [...retained, ...picked].some(task => task.ieltsSkill || task.satSkill)) continue;
    if (picked.length >= 2 && item.score < 140 && picked.some(task => task.category === item.category) && candidates.some(other => !picked.includes(other) && other.score >= 40 && !picked.some(task => task.category === other.category))) continue;
    const slotsLeft = remainingCount - picked.length;
    const reserved = Math.min(Math.max(0, slotsLeft - 1) * 5, Math.max(0, budget - 5));
    // "More" uses spare capacity for deeper practice, without raising the
    // timetable allowance or adding an unbounded list of new actions.
    const deeperSession = load.budget >= 150 && !item.roadmapAction && !item.revisionStage && !item.eventStage && !item.ieltsSkill && !item.satSkill;
    const baseMinutes = deeperSession ? Math.min(item.category === 'academics' ? 60 : item.category === 'language' ? 45 : 30, Math.ceil(item.minutes * (item.category === 'academics' ? 2.4 : 2))) : item.minutes;
    const requestedMinutes = load.effort === 'more' && !item.ieltsSkill && !item.satSkill ? Math.ceil(baseMinutes * 1.2) : baseMinutes;
    if (item.satSkill === 'full' && (budget < 144 || !placeTasks([...retained, ...picked, { ...item, minutes: 144 }], availability.freeWindows).at(-1)?.sessions.some(session => clockMinutes(session.end) - clockMinutes(session.start) >= 144))) continue;
    const minutes = item.satSkill === 'full' ? 144 : Math.min(requestedMinutes, budget - reserved);
    if (minutes < 5) continue;
    picked.push({ ...item, requestedMinutes, minutes });
    budget -= minutes;
  }
  // Category balance can leave fewer viable actions than the reserved slots.
  // Return unused reservation to the selected exercises before calling the
  // week "more"; an extra slot must not shorten the total practice instead.
  for (const item of picked) {
    const extra = Math.min(budget, Math.max(0, item.requestedMinutes - item.minutes));
    item.minutes += extra;
    budget -= extra;
  }
  const generated = picked.map(item => {
    const id = `plan-${date}-${item.key}`;
    const old = previous.get(id);
    const scaled = item.minutes < item.requestedMinutes;
    const learningMetadata = ['academics', 'language'].includes(item.category) && !item.roadmapAction ? getTaskLearningMetadata(item, state, date) : item;
    return {
      id, date, title: item.revisionStage === 'timed' && scaled ? `${subjectLabel(subjectFor(state, item.subjectId))}: eine Prüfungs-Teilaufgabe unter Zeitdruck üben` : item.eventStage === 'rehearsal' && scaled ? `${item.title.split(':')[0]}: einen zeitgebundenen Testabschnitt üben` : item.title, category: item.category, subjectId: item.subjectId || '', examId: item.examId || '', goalId: item.goalId || '',
      roadmapItemId: item.roadmapItemId || '', roadmapStepId: item.roadmapStepId || '', linkedGoal: item.linkedGoal || '', eventId: item.eventId || (item.examId ? `exam:${item.examId}` : ''), eventSourceId: item.eventSourceId || item.examId || '', eventStage: item.eventStage || '',
      minutes: item.minutes, priority: item.priority, reason: item.reason,
      objective: learningMetadata.objective || item.title, expectedResult: learningMetadata.expectedResult || 'Ein überprüftes Ergebnis und ein konkreter nächster Schritt.', learningTopic: learningMetadata.learningTopic || '', ieltsSkill: item.ieltsSkill || '', satSkill: item.satSkill || '', reviewDate: item.reviewDate || '', movedFrom: '',
      steps: scaled ? ['Nutze diese kurze Einheit für einen kleinen Teil der Aufgabe.', ...item.steps] : item.steps,
      resource: item.resource || '', completed: false, completedAt: null, notes: old?.notes || '', selfReview: old?.selfReview || [], origin: 'generated',
      revisionStage: item.revisionStage || '', revisionPlanId: item.revisionPlanId || '',
      planSignature: signature,
    };
  });
  const located = placeTasks([...retained, ...generated], availability.freeWindows).map(task => {
    if (task.eventStage === 'rehearsal' && !task.completed && task.id !== activeTaskId) {
      const stage = getEventPlan(state, task.eventId, date).find(step => step.stage === 'rehearsal');
      const longest = Math.max(0, ...task.sessions.map(session => clockMinutes(session.end) - clockMinutes(session.start)));
      if (stage && longest < (stage.requiredMinutes || stage.minutes)) return { ...task, title: `${task.title.split(':')[0]}: einen zeitgebundenen Testabschnitt üben`, steps: words([`Das ist Teilaufgabenpraxis. Für den vollständigen Probedurchlauf brauchst du eine ununterbrochene ${stage.requiredMinutes || stage.minutes}-Minuten-Einheit.`, ...task.steps], 12) };
    }
    if (task.revisionStage !== 'timed' || task.completed || task.id === activeTaskId) return task;
    const stage = getExamPlan(state, task.examId, date).find(step => step.id === task.revisionPlanId);
    const longest = Math.max(0, ...task.sessions.map(session => clockMinutes(session.end) - clockMinutes(session.start)));
    if (!stage || longest >= stage.requiredMinutes) return task;
    return { ...task, title: `${subjectLabel(subjectFor(state, task.subjectId))}: eine Prüfungs-Teilaufgabe unter Zeitdruck üben`, steps: words(['Das ist ein teilweiser Probedurchlauf. Für den vollständigen Vorbereitungsschritt ist weiter eine ununterbrochene Einheit nötig.', ...task.steps], 12) };
  });
  const reconsidered = new Set(existing.map(task => task.id));
  const tasks = [...state.tasks.filter(task => task.date !== date || (task.skipped && !reconsidered.has(task.id))), ...parked, ...located];
  // A stable reference prevents redundant storage writes and React update loops.
  if (JSON.stringify(tasks) === JSON.stringify(state.tasks)) return state;
  return { ...state, tasks };
}

function planSignature(state, date) {
  const priorWeek = shiftDate(startOfWeek(date), -7);
  const { schoolYear, schoolSystem, graduationYear, universityStartYear, applicationYear, pathways, targetFields, englishLevel, germanLevel, testPlans, prioritySubjects } = state.profile;
  const planningProfile = { schoolYear, schoolSystem, graduationYear, universityStartYear, applicationYear, pathways, targetFields, englishLevel, germanLevel, prioritySubjects,
    testPlans: (testPlans || []).map(({ id, name, status, targetDate, targetScore }) => ({ id, name, status, targetDate, targetScore })),
  };
  const input = canonicalJSON({
    engineVersion: 9, date, profile: planningProfile, subjects: state.subjects.map(({ forecast, ...subject }) => subject), grades: state.grades, exams: state.exams, ielts: normalizeIELTS(state.ielts), sat: normalizeSAT(state.sat), learning: { attempts: normalizeLearning(state.learning).attempts },
    universities: state.universities, activities: state.activities, events: state.events || [], schedule: state.schedule,
    roadmapConfirmed: state.roadmapCompleted,
    // A Sunday review guides the following week. Reflection text, save time,
    // and reviews for other weeks must not refill today's remaining actions.
    reviews: state.weeklyReviews.filter(review => review.weekStart === priorWeek).map(review => {
      const requested = text(review.effort, 100).toLowerCase();
      return { focusSubjectId: review.focusSubjectId || '', effort: ['lighter', 'more'].includes(requested) ? requested : 'same' };
    }).filter(review => review.focusSubjectId || review.effort !== 'same'),
    dismissed: state.dismissedTaskIds,
    priorCompleted: state.tasks.filter(task => task.completed && completionDate(task) < date).map(task => [task.id, task.examId, task.revisionStage, task.roadmapItemId, task.roadmapStepId, task.eventId, task.eventStage, task.minutes]),
    priorWeek: state.tasks.filter(task => task.date >= priorWeek && task.date < startOfWeek(date)).map(task => [task.id, task.subjectId, task.completed && completionDate(task) < date]),
    custom: state.tasks.filter(task => task.date === date && task.origin === 'custom' && !task.skipped).map(task => [task.id, task.title, task.minutes, task.category]),
  });
  // A compact deterministic fingerprint; it never contains profile text.
  let first = 2166136261;
  let second = 5381;
  for (let i = 0; i < input.length; i++) { first = Math.imul(first ^ input.charCodeAt(i), 16777619); second = Math.imul(second, 33) ^ input.charCodeAt(i); }
  return `${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
}

function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
}

function placeTasks(tasks, freeWindows) {
  const windows = freeWindows.map(window => ({ cursor: clockMinutes(window.start), end: clockMinutes(window.end) }));
  return tasks.map(task => {
    let remaining = task.minutes;
    const sessions = [];
    if (task.satSkill === 'full') {
      // A full digital test requires one uninterrupted block including its break.
      const window = windows.find(item => item.end - item.cursor >= remaining);
      if (window) {
        sessions.push({ start: clock(window.cursor), end: clock(window.cursor + remaining) });
        window.cursor += remaining;
      }
      return { ...task, sessions, start: sessions[0]?.start || '', end: sessions[0]?.end || '' };
    }
    for (const window of windows) {
      if (!remaining) break;
      const duration = Math.min(remaining, window.end - window.cursor);
      if (duration <= 0) continue;
      sessions.push({ start: clock(window.cursor), end: clock(window.cursor + duration) });
      window.cursor += duration;
      remaining -= duration;
    }
    return { ...task, sessions, start: sessions[0]?.start || '', end: sessions.at(-1)?.end || '' };
  });
}

export function getDailyPlan(state, date, referenceDate = date) {
  const planned = ensureDailyPlan(state, date, referenceDate);
  const isHistory = date < referenceDate || date < planned.createdDate;
  if (isHistory) {
    const tasks = planned.tasks.filter(task => task.date === date);
    return {
      isHistory, tasks, availableMinutes: null, plannedMinutes: totalTaskMinutes(tasks.filter(task => !task.skipped)), remainingMinutes: null,
      goal: 'Dein gespeicherter Lernverlauf',
      adjustment: tasks.length ? 'Das sind deine gespeicherten Aufgaben für diesen Tag. Frühere Pläne bleiben erhalten und werden nicht mit heutigen Einstellungen neu berechnet.' : 'Für diesen Tag wurden keine Aufgaben gespeichert. Dein Verlauf wird nicht nachträglich mit Empfehlungen gefüllt.',
      goalChain: { longTerm: 'Deine dokumentierte Arbeit', monthly: 'Gespeicherte Aufgaben zählen zu deinem Monatsfortschritt', weekly: 'Frühere Arbeit bleibt im Verlauf, ohne einen Aufgabenstau zu erzeugen' },
      freeWindows: [],
    };
  }
  const availability = getAvailability(planned, date);
  const tasks = planned.tasks.filter(task => task.date === date && !task.skipped);
  const plannedMinutes = tasks.reduce((sum, task) => sum + task.minutes, 0);
  const goals = getGoals(planned, date);
  const top = tasks.find(task => !task.completed) || tasks[0];
  const boost = weeklyBoost(planned, date);
  const load = weeklyLoad(planned, date, availability.availableMinutes);
  const previousDate = shiftDate(date, -1);
  const missed = state.tasks.filter(task => task.date === previousDate && !task.completed).length;
  const linkedMonthly = goals.monthly.find(goal => goal.roadmapItemIds.includes(top?.roadmapItemId)) || goals.monthly.find(goal => goal.category === top?.category) || goals.monthly[0];
  const linkedWeekly = goals.weekly.find(goal => goal.roadmapItemIds.includes(top?.roadmapItemId)) || goals.weekly.find(goal => goal.category === top?.category) || goals.weekly[0];
  const selectedPath = state.profile.pathways.find(path => top?.roadmapItemId.startsWith(`${path}-`)) || state.profile.pathways[0];
  return {
    isHistory, tasks, availableMinutes: availability.availableMinutes, plannedMinutes, remainingMinutes: Math.max(0, availability.availableMinutes - plannedMinutes),
    goal: top ? top.objective || top.title : 'Erhole dich und starte danach mit einem klaren Plan',
    adjustment: tasks.length > 5 ? 'Für diesen Tag sind mehr als fünf feste Aufgaben gespeichert. Verschiebe eine eigene Aufgabe, damit der Tag übersichtlich bleibt.' : retainedOverBudget(tasks, availability.availableMinutes) ? 'Deine festen Aufgaben überschreiten die verfügbare Zeit. Verschiebe eine eigene Aufgabe, um Raum zu schaffen.' : availability.availableMinutes === 0 ? 'Heute ist keine Lernzeit frei. Feste Termine und Erholung haben Vorrang; der nächste Tag wird passend geplant.' : load.effort === 'lighter' ? `${plannedMinutes > load.budget ? 'Deine feste Arbeit nutzt das reduzierte Ziel bereits aus. Es kommen keine zusätzlichen Aufgaben hinzu.' : load.budget < availability.availableMinutes ? 'Dein Wochenrückblick wünscht eine leichtere Woche: Der Plan lässt 20 % Lernzeit frei.' : 'Deine leichtere Woche begrenzt den Tag auf eine kurze Aufgabe.'}${boost ? ` ${boost.reason}` : ''}` : load.effort === 'more' ? `Dein Wochenrückblick wünscht etwas mehr: Längere Einheiten nutzen freie Zeit innerhalb deines ${availability.availableMinutes}-Minuten-Limits.${boost ? ` ${boost.reason}` : ''}` : boost ? boost.reason : missed ? `${missed} offene Aufgabe${missed === 1 ? '' : 'n'} von gestern ${missed === 1 ? 'fließt' : 'fließen'} in einen neuen Plan ein. Es entsteht kein Aufgabenstau.` : 'Ein fokussierter Plan aus Prüfungen, Notenzielen, Sprachübung und Studienvorbereitung.',
    goalChain: { longTerm: goals.longTerm, yearly: goals.yearly.find(goal => goal.pathway === selectedPath)?.title || '', semester: goals.semester.find(goal => goal.pathway === selectedPath)?.title || '', monthly: linkedMonthly?.title || 'Eine verlässliche Lernroutine entwickeln', weekly: linkedWeekly?.title || 'Einige gezielte Lerneinheiten abschließen', roadmapItemId: top?.roadmapItemId || '', linkedGoal: top?.linkedGoal || '' },
    freeWindows: availability.freeWindows,
  };
}
function totalTaskMinutes(tasks) { return tasks.reduce((sum, task) => sum + task.minutes, 0); }
function retainedOverBudget(tasks, minutes) { return tasks.reduce((sum, task) => sum + task.minutes, 0) > minutes; }

function progressFor(state, category, start, end, target) {
  const done = state.tasks.filter(task => task.category === category && task.completed && completionDate(task) >= start && completionDate(task) <= end).length;
  return { progress: Math.min(100, Math.round(done / Math.max(1, target) * 100)), completed: done, target };
}
export function getGoals(state, date) {
  calendar(date);
  const monthStart = `${date.slice(0, 7)}-01`;
  const monthEnd = localDateKey(new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0, 12));
  const weekStart = startOfWeek(date);
  const weekEnd = shiftDate(weekStart, 6);
  const upcomingExams = [...state.exams].filter(exam => exam.date >= date).sort((a, b) => a.date.localeCompare(b.date));
  const academicExam = upcomingExams.find(exam => !languageKind(subjectFor(state, exam.subjectId)));
  const languageExam = upcomingExams.find(exam => languageKind(subjectFor(state, exam.subjectId)));
  const weakest = subjectFor(state, getSubjectPriorities(state, date)[0]?.subjectId);
  const graduated = state.profile.schoolYear === 'Graduated';
  const longTerm = `${graduated ? 'Ein starkes Studienprofil entwickeln' : `Abitur ${state.profile.graduationYear || 'im geplanten Abschlussjahr'} abschließen`} und passende Studienoptionen für ${state.profile.pathways.map(path => path === 'Germany' ? 'Deutschland' : path).join(' + ') || 'deinen Studienweg'} in ${state.profile.targetFields.slice(0, 2).join(' / ') || 'deinem Wunschfeld'} vorbereiten.`;
  const priorities = getRoadmapPriorities(state, date);
  const roadmaps = state.profile.pathways.map(path => ({ path, phases: getRoadmap(state, path, date) }));
  const categoryItems = category => priorities.filter(item => item.category === category);
  const chosen = category => categoryItems(category)[0];
  const availableDays = Array.from({ length: 7 }, (_, offset) => getAvailability(state, shiftDate(weekStart, offset)).availableMinutes).filter(minutes => minutes >= 5).length;
  const academicSessions = Math.min(4, availableDays);
  const languageSessions = Math.min(3, availableDays);
  const templates = [
    ...(graduated && !academicExam ? [] : [['grades', 'academics', academicExam ? `Gezielt auf ${academicExam.title} vorbereiten` : `${weakest ? subjectLabel(weakest) : 'Deine Kernfächer'} in Richtung Zielnote entwickeln`, 'Wähle den nächsten Lernschritt anhand echter Notenabstände, anstehender Leistungen und Lehrkraft-Feedback.', academicSessions * 4, academicSessions]]),
    ['language', 'language', languageExam ? `Gezielt auf ${languageExam.title} vorbereiten` : chosen('language')?.title || 'Englisches und deutsches Schreiben stärken', `Schreibe klar auf deinem aktuellen Englischniveau und nutze Schulfeedback sowie geprüfte Sprachtestvorgaben.`, languageSessions * 4, languageSessions],
    ['research', 'university', chosen('university')?.title || 'Bewerbungsvoraussetzungen aktuell halten', chosen('university')?.description || 'Prüfe die nächste tatsächliche Studiengangsvoraussetzung, Unterlage oder Frist.', 6, Math.min(2, availableDays)],
    ['activities', 'activity', chosen('activity')?.title || 'Langfristige Erfahrung und echte neue Ergebnisse festhalten', chosen('activity')?.description || 'Aktualisiere sinnvolle Verantwortung und tatsächliche Ergebnisse gelegentlich.', 4, availableDays ? 1 : 0],
    ['review', 'review', 'Den Plan mit einem Wochenrückblick anpassen', 'Prüfe deine abgeschlossene Arbeit, erkenne Hindernisse und wähle die nächsten Wochenschwerpunkte.', 4, availableDays ? 1 : 0],
  ];
  const periodGoals = (period, start, end, index) => templates.map(([id, category, title, description, monthTarget, weekTarget]) => {
    const recordedIds = new Set(state.tasks.filter(task => task.completed && completionDate(task) >= start && completionDate(task) <= end).map(task => task.roadmapItemId).filter(Boolean));
    // Finished milestones leave the upcoming-priority queue, but work already
    // recorded this period must keep its connection and earned progress.
    const recordedItems = roadmaps.flatMap(({ phases }) => phases.flatMap(phase => phase.items))
      .filter(item => recordedIds.has(item.id) && taskCategoryForMilestone(item) === category);
    const linkedItems = [...new Map([...categoryItems(category), ...recordedItems].map(item => [item.id, item])).values()];
    const roadmapItemIds = linkedItems.map(item => item.id);
    const target = index === 'week' ? weekTarget : monthTarget;
    const due = linkedItems[0];
    let stats = progressFor(state, category, start, end, target);
    if (['university', 'activity'].includes(category)) {
      const matching = state.tasks.filter(task => task.completed && completionDate(task) >= start && completionDate(task) <= end
        && (roadmapItemIds.includes(task.roadmapItemId) || Boolean(task.eventId) && (category === 'activity' ? ['activities', 'internships'].includes(task.goalId) : ['research', 'applications', 'tests'].includes(task.goalId))));
      const achievableSteps = linkedItems.reduce((sum, item) => sum + item.steps.filter(action => !action.completed || matching.some(task => task.roadmapStepId === action.id)).length, 0);
      const actionTarget = Math.min(Math.max(1, target), Math.max(1, achievableSteps));
      stats = { completed: matching.length, target: actionTarget, progress: Math.min(100, Math.round(matching.length / actionTarget * 100)) };
    }
    return { id: `${period}-${start}-${id}`, title: index === 'week' ? id === 'grades' ? `${target} gezielte Lerneinheiten${weakest ? ` mit Schwerpunkt ${subjectLabel(weakest)}` : ''}` : id === 'language' ? `${target} gezielte Spracheinheiten mit Feedback` : id === 'research' ? due?.nextStep?.title || 'Die nächste Hochschulvoraussetzung oder Unterlage prüfen' : id === 'activities' ? due?.nextStep?.title || 'Bei Bedarf einen neuen eigenen Beitrag festhalten' : 'Sonntagsrückblick und nächsten Schwerpunkt speichern' : title,
      description, category, roadmapItemIds, pathway: due?.pathway || '', start, end, dueDate: due?.dueDate || end, nextAction: due?.nextStep?.title || '', ...stats };
  });
  const hierarchyGoal = (path, phases, period, start, end, selected) => {
    const items = selected.flatMap(phase => phase.items).filter(item => !graduated || item.category !== 'grades');
    const actionCompleted = items.reduce((sum, item) => sum + item.completedSteps, 0);
    const actionTotal = items.reduce((sum, item) => sum + item.totalSteps, 0);
    const next = priorities.find(item => item.pathway === path && items.some(value => value.id === item.id));
    const activeTransition = selected.some(phase => phase.key === 'university' && phase.start <= date);
    const finalSchoolYear = !graduated && selected.some(phase => phase.key === 'abitur');
    const applicationSeason = selected.some(phase => phase.key === 'applications');
    const yearTitle = activeTransition ? `Einschreibung und Studienstart ${date.slice(0, 4)} vorbereiten` : finalSchoolYear ? `Abitur abschließen und Zulassungsentscheidungen ${date.slice(0, 4)} vorbereiten` : applicationSeason ? `Bewerbungen ${date.slice(0, 4)} vorbereiten und prüfen` : graduated ? `die nächste Bewerbungsrunde vorbereiten` : selected.some(phase => phase.key === 'q3') ? `Studiengänge eingrenzen und Zulassungsvoraussetzungen ${date.slice(0, 4)} prüfen` : `Q1-Noten, Sprache und ein langfristiges Profil ${date.slice(0, 4)} entwickeln`;
    return { id: `${period}-${path}-${start}`, pathway: path, category: 'university', title: `${path}: ${period === 'year' ? yearTitle : selected.map(phase => phase.label).join(' + ') || 'die nächste Studienphase vorbereiten'}`,
      description: next ? `Nächster Schwerpunkt: ${next.title}. ${next.description}` : 'Halte geprüfte Anforderungen aktuell und bestätige Schritte erst, wenn sie wirklich erreicht sind.', start, end, dueDate: next?.dueDate || end,
      roadmapItemIds: items.map(item => item.id), completed: actionCompleted, target: actionTotal, progress: actionTotal ? Math.round(actionCompleted / actionTotal * 100) : 0,
      milestonesCompleted: items.filter(item => item.confirmed).length, milestonesTotal: items.length };
  };
  const yearStart = `${date.slice(0, 4)}-01-01`;
  const yearEnd = `${date.slice(0, 4)}-12-31`;
  const currentSemesters = roadmaps.map(({ path, phases }) => {
    const school = phases.find(phase => /^q[1-4]$/.test(phase.key) && phase.start <= date && phase.end >= date);
    const declared = phases.find(phase => phase.label === state.profile.schoolYear);
    const selected = graduated ? phases.filter(phase => ['preparation', 'applications', 'admission', 'university'].includes(phase.key) && phase.start <= date && phase.end >= date)
      : [school || declared].filter(Boolean);
    return hierarchyGoal(path, phases, 'semester', selected[0]?.start || weekStart, selected.at(-1)?.end || yearEnd, selected);
  });
  return { longTerm,
    yearly: roadmaps.map(({ path, phases }) => hierarchyGoal(path, phases, 'year', yearStart, yearEnd, phases.filter(phase => phase.start <= yearEnd && phase.end >= yearStart))),
    semester: currentSemesters,
    monthly: periodGoals('month', monthStart, monthEnd, 'month'),
    weekly: periodGoals('week', weekStart, weekEnd, 'week'),
  };
}

export function getRoadmap(state, pathway = 'USA', date = localDateKey()) {
  calendar(date);
  return buildRoadmap(state, pathway, date);
}

export function getWeeklyReview(state, date = localDateKey()) {
  const weekStart = startOfWeek(date);
  const weekEnd = shiftDate(weekStart, 6);
  const measured = getStudyStats(state, weekStart, weekEnd);
  const scheduled = state.tasks.filter(task => task.date >= weekStart && task.date <= weekEnd);
  const completed = state.tasks.filter(task => task.completed && completionDate(task) >= weekStart && completionDate(task) <= weekEnd);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = shiftDate(weekStart, index);
    const actual = completed.filter(task => completionDate(task) === day);
    return { date: day, completed: actual.length, total: scheduled.filter(task => task.date === day).length, minutes: actual.reduce((sum, task) => sum + task.minutes, 0), timedSeconds: measured.byDay[day] || 0 };
  });
  const bySubject = state.subjects.filter(subject => subject.enabled).map(subject => {
    const total = scheduled.filter(task => task.subjectId === subject.id).length;
    const done = completed.filter(task => task.subjectId === subject.id).length;
    return { subject, total, completed: done, rate: total ? done / total : 0 };
  }).filter(entry => entry.total || entry.completed);
  const strongest = [...bySubject].filter(entry => entry.completed).sort((a, b) => b.rate - a.rate || b.completed - a.completed)[0];
  const weakest = [...bySubject].filter(entry => entry.total > entry.completed).sort((a, b) => a.rate - b.rate || subjectGap(b.subject) - subjectGap(a.subject))[0];
  const scheduledIds = new Set(scheduled.map(task => task.id));
  const total = scheduled.length + completed.filter(task => !scheduledIds.has(task.id)).length;
  const count = completed.length;
  const saved = state.weeklyReviews.find(review => review.weekStart === weekStart);
  const focused = subjectFor(state, saved?.focusSubjectId || weakest?.subject.id);
  return {
    weekStart, weekEnd, completed: count, total, minutes: completed.reduce((sum, task) => sum + task.minutes, 0), measuredSeconds: measured.seconds, measuredSessions: measured.sessions,
    completionRate: total ? Math.min(100, Math.round(count / total * 100)) : 0,
    consistency: days.filter(day => day.completed > 0 || day.timedSeconds > 0).length,
    strong: strongest ? `${subjectLabel(strongest.subject)} · regelmäßig geübt` : 'Deine erste abgeschlossene Einheit schafft einen Ausgangspunkt',
    needsAttention: weakest ? `${subjectLabel(weakest.subject)}${weakest.subject.weakTopics[0] ? ` · ${weakest.subject.weakTopics[0]}` : ''}` : 'Realistisch planen und Erholung schützen',
    universityProgress: completed.filter(task => ['university', 'activity'].includes(task.category)).length,
    days, adjustment: focused ? `Plane nächste Woche eine kurze, gezielte Einheit für ${subjectLabel(focused)}. Offene Aufgaben bleiben im Verlauf; der neue Plan berücksichtigt deinen aktuellen Bedarf.` : 'Verbinde schulische Übung, Sprache und Bewerbungsprofil. Wenn die Woche zu voll war, passe deine verfügbare Zeit an.',
    saved: saved || null,
  };
}
export function getProgress(state, date = localDateKey()) {
  const completedDays = new Set(state.tasks.filter(task => task.completed).map(completionDate).filter(Boolean));
  for (const [day, seconds] of Object.entries(getStudyStats(state).byDay)) {
    if (seconds > 0) completedDays.add(day);
  }
  let cursor = completedDays.has(date) ? date : shiftDate(date, -1);
  let streak = 0;
  while (completedDays.has(cursor) && streak < 10000) { streak++; cursor = shiftDate(cursor, -1); }
  return {
    weekly: getWeeklyReview(state, date),
    subjects: state.subjects.filter(subject => subject.enabled).map(subject => { const academic = calculateSubject(state, subject.id); return { ...subject, current: academic.average, gap: academic.gap, methodLabel: academic.methodLabel, trend: academic.trend }; }),
    exams: [...state.exams].filter(exam => exam.date >= date).sort((a, b) => a.date.localeCompare(b.date)).map(exam => {
      const plan = getExamPlan(state, exam.id, date);
      const completed = plan.filter(step => step.completed).length;
      return { ...exam, readiness: plan.length ? Math.round(completed / plan.length * 100) : 0, completed, total: plan.length };
    }),
    roadmap: Object.fromEntries(['USA', 'Germany'].map(path => {
      const items = getRoadmap(state, path, date).flatMap(phase => phase.items);
      const actionsCompleted = items.reduce((sum, item) => sum + item.completedSteps, 0);
      const actionsTotal = items.reduce((sum, item) => sum + item.totalSteps, 0);
      const work = items.flatMap(item => item.steps);
      const requiredMinutes = work.reduce((sum, action) => sum + action.minutes, 0);
      const completedMinutes = work.reduce((sum, action) => sum + Math.min(action.minutes, action.completedMinutes), 0);
      return [path, { completed: items.filter(item => item.completed).length, total: items.length, actionsCompleted, actionsTotal, actionProgress: requiredMinutes ? Math.round(completedMinutes / requiredMinutes * 100) : 0 }];
    })), streak,
  };
}

function replaceRecord(state, key, record) {
  const exists = state[key].some(item => item.id === record.id);
  return { ...state, [key]: exists ? state[key].map(item => item.id === record.id ? record : item) : [...state[key], record] };
}
function requireRecord(record, message) { if (!record) throw new TypeError(message); return record; }
export function saveProfile(state, patch) { return { ...state, profile: normalProfile({ ...state.profile, ...patch }) }; }
export function saveSubject(state, subject) {
  const old = state.subjects.find(item => item.id === subject.id);
  const merged = { ...old, ...subject, id: subject.id || uid('subject') };
  if (Object.hasOwn(subject, 'written') && subject.written !== old?.written) merged.baselineWritten = subject.written;
  if (Object.hasOwn(subject, 'oral') && subject.oral !== old?.oral) merged.baselineOral = subject.oral;
  return replaceRecord(state, 'subjects', requireRecord(normalSubject(merged), 'A subject needs a name.'));
}
export function saveExam(state, exam) {
  const old = state.exams.find(item => item.id === exam.id);
  const record = requireRecord(normalExam({ ...old, ...exam, id: exam.id || uid('exam') }), 'An exam needs a title and valid date.');
  if (!state.subjects.some(subject => subject.id === record.subjectId)) throw new TypeError('Choose an existing subject for the exam.');
  return replaceRecord(state, 'exams', record);
}
export function removeExam(state, id) {
  return { ...state, exams: state.exams.filter(exam => exam.id !== id), tasks: state.tasks.filter(task => task.examId !== id || task.completed || task.skipped || task.notes?.trim() || task.selfReview?.length || task.origin === 'custom' || task.id === state.study?.active?.taskId) };
}
export function saveActivity(state, activity) {
  const old = state.activities.find(item => item.id === activity.id);
  return replaceRecord(state, 'activities', requireRecord(normalActivity({ ...old, ...activity, id: activity.id || uid('activity') }), 'An activity needs a name.'));
}
export function removeActivity(state, id) { return { ...state, activities: state.activities.filter(activity => activity.id !== id) }; }
export function saveUniversity(state, university) {
  const old = state.universities.find(item => item.id === university.id);
  return replaceRecord(state, 'universities', requireRecord(normalUniversity({ ...old, ...university, id: university.id || uid('university') }), 'A university needs a name.'));
}
export function removeUniversity(state, id) { return { ...state, universities: state.universities.filter(university => university.id !== id) }; }
export function saveSchedule(state, patch) { return { ...state, schedule: normalSchedule({ ...state.schedule, ...patch }) }; }
export function saveWeeklyReview(state, review) {
  if (!isDateKey(review.weekStart)) throw new TypeError('A review needs a valid week date.');
  const record = { weekStart: startOfWeek(review.weekStart), reflection: text(review.reflection, 4000), focusSubjectId: text(review.focusSubjectId, 150), effort: text(String(review.effort ?? ''), 100), completedAt: new Date().toISOString() };
  const weeklyReviews = [...state.weeklyReviews.filter(item => item.weekStart !== record.weekStart), record].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  return { ...state, weeklyReviews };
}
export function toggleRoadmapItem(state, id) {
  const valid = ['USA', 'Germany'].flatMap(path => getRoadmap(state, path).flatMap(phase => phase.items)).some(item => item.id === id);
  if (!valid) return state;
  return { ...state, roadmapCompleted: state.roadmapCompleted.includes(id) ? state.roadmapCompleted.filter(item => item !== id) : [...state.roadmapCompleted, id] };
}
export function toggleTask(state, id, now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Task completion needs a valid timestamp.');
  return { ...state,
    dismissedTaskIds: state.dismissedTaskIds.filter(key => key !== id),
    tasks: state.tasks.map(task => task.id === id ? { ...task, completed: !task.completed, completedAt: task.completed ? null : date.toISOString(), ...(task.skipped !== undefined ? { skipped: false } : {}) } : task),
  };
}
export function saveTaskNotes(state, id, notes) { return { ...state, tasks: state.tasks.map(task => task.id === id ? { ...task, notes: text(notes, 5000) } : task) }; }
export function saveTaskReview(state, id, criterionIds) { return { ...state, tasks: state.tasks.map(task => task.id === id ? { ...task, selfReview: [...new Set(words(criterionIds).map(value => value.slice(0, 150)))].slice(0, 12) } : task) }; }
export function addTask(state, task) {
  const retained = state.tasks.filter(item => item.date === task.date && !item.skipped && (item.origin === 'custom' || item.completed || item.notes?.trim() || item.selfReview?.length || hasTutorWork(state, item) || item.id === state.study?.active?.taskId));
  if (!task.id && retained.length >= 5) throw new TypeError('Keep today focused: move or remove an action before adding a sixth.');
  const old = state.tasks.find(item => item.id === task.id);
  const record = requireRecord(normalTask({ ...old, ...task, id: task.id || uid('task'), origin: 'custom', completed: old?.completed || false, completedAt: old?.completedAt || null }), 'A task needs a title and valid date.');
  return { ...replaceRecord(state, 'tasks', record), dismissedTaskIds: old?.origin === 'generated' ? [...new Set([...(state.dismissedTaskIds || []), old.id])] : state.dismissedTaskIds };
}
/** Edits keep saved answers, notes, and completion evidence intact. */
export function editTask(state, id, patch) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return state;
  if (task.satSkill === 'full' && patch.minutes !== undefined && Number(patch.minutes) !== 144) throw new TypeError('Ein vollständiger Bluebook-Probetest braucht 144 Minuten einschließlich Pause. Wähle für eine kurze Einheit eine andere Aufgabe.');
  return addTask(state, { ...task, ...patch, id });
}
/** A deliberate move preserves the task ID and writing rather than cloning it. */
export function moveTask(state, id, date) {
  if (!isDateKey(date)) throw new TypeError('Wähle ein gültiges Datum.');
  const task = state.tasks.find(item => item.id === id);
  if (!task || task.date === date) return state;
  if (task.completed) throw new TypeError('Abgeschlossene Aufgaben bleiben im Verlauf.');
  if (state.study?.active?.taskId === id) throw new TypeError('Beende zuerst die aktive Lerneinheit.');
  const retained = state.tasks.filter(item => item.date === date && !item.skipped && (item.origin === 'custom' || item.completed || item.notes?.trim() || item.selfReview?.length || hasTutorWork(state, item)));
  if (retained.length >= 5) throw new TypeError('An diesem Tag sind bereits fünf feste Aufgaben. Wähle einen anderen Tag.');
  if (task.satSkill === 'full') {
    const availability = getAvailability(state, date);
    const room = availability.availableMinutes - retained.reduce((sum, item) => sum + item.minutes, 0);
    const placement = placeTasks([...retained, { ...task, minutes: 144 }], availability.freeWindows).at(-1);
    if (room < 144 || !placement.sessions.some(session => clockMinutes(session.end) - clockMinutes(session.start) >= 144)) throw new TypeError('Dieser Tag hat keinen freien Block von 144 Minuten. Wähle für den vollständigen Probetest einen anderen Tag.');
  }
  return { ...state,
    tasks: state.tasks.map(item => item.id === id ? { ...item, date, origin: 'custom', movedFrom: item.movedFrom || item.date, skipped: false, sessions: [], start: '', end: '', planSignature: '' } : item),
    dismissedTaskIds: task.origin === 'generated' ? [...new Set([...(state.dismissedTaskIds || []), id])] : state.dismissedTaskIds,
  };
}
/** Keep the old action in history and select another action within the budget. */
export function replaceTask(state, id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task || task.completed) return state;
  if (state.study?.active?.taskId === id) throw new TypeError('Beende zuerst die aktive Lerneinheit.');
  return ensureDailyPlan(skipTask(state, id), task.date);
}
export function removeTask(state, id) {
  const removed = state.tasks.find(task => task.id === id);
  return { ...state, tasks: state.tasks.filter(task => task.id !== id), dismissedTaskIds: removed?.origin === 'generated' ? [...new Set([...(state.dismissedTaskIds || []), id])] : state.dismissedTaskIds };
}
/** Skip today's action without deleting its draft or rewriting past history. */
export function skipTask(state, id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task || task.completed || task.skipped) return state;
  return { ...state,
    tasks: state.tasks.map(item => item.id === id ? { ...item, skipped: true } : item),
    dismissedTaskIds: task.origin === 'generated' ? [...new Set([...(state.dismissedTaskIds || []), id])] : state.dismissedTaskIds,
  };
}
export function addGrade(state, grade) {
  if (!state.subjects.some(subject => subject.id === grade.subjectId)) throw new TypeError('Choose an existing subject.');
  if (grade.points === '' || grade.points === null || grade.points === undefined || typeof grade.points === 'boolean' || !Number.isFinite(Number(grade.points)) || Number(grade.points) < 0 || Number(grade.points) > 15) throw new TypeError('Points must be between 0 and 15.');
  if (!isDateKey(grade.date)) throw new TypeError('A grade needs a valid date.');
  const old = state.grades.find(item => item.id === grade.id);
  const record = requireRecord(normalizeAcademicGrade({ ...old, ...grade, id: grade.id || uid('grade'), points: Number(grade.points) }), 'Eine Note braucht Fach, Datum und 0–15 Punkte.');
  let next = replaceRecord(state, 'grades', record);
  if (old && (old.subjectId !== record.subjectId || old.type !== record.type)) next = recomputeGrades(next, old.subjectId, old.type);
  return recomputeGrades(next, record.subjectId, record.type);
}
function recomputeGrades(state, subjectId, type) {
  if (!['written', 'oral'].includes(type)) return state;
  const records = state.grades.filter(grade => grade.subjectId === subjectId && grade.type === type);
  const average = records.length ? records.reduce((sum, grade) => sum + grade.points, 0) / records.length : null;
  return { ...state, subjects: state.subjects.map(subject => subject.id === subjectId ? { ...subject, [type]: average === null ? subject[type === 'oral' ? 'baselineOral' : 'baselineWritten'] ?? null : Math.round(average * 10) / 10 } : subject) };
}
export function removeGrade(state, id) {
  const removed = state.grades.find(grade => grade.id === id);
  if (!removed) return state;
  return recomputeGrades({ ...state, grades: state.grades.filter(grade => grade.id !== id) }, removed.subjectId, removed.type);
}
export function saveReflection(state, reflection) {
  if (!isDateKey(reflection.date)) throw new TypeError('A reflection needs a valid date.');
  const record = { date: reflection.date, achieved: text(reflection.achieved, 4000), next: text(reflection.next, 4000), gratitude: text(reflection.gratitude, 4000), intention: text(reflection.intention, 4000) };
  return { ...state, reflections: [...state.reflections.filter(entry => entry.date !== reflection.date), record].sort((a, b) => b.date.localeCompare(a.date)) };
}
