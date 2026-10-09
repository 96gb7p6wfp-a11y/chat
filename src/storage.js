import { createPersonalProfile, ensureDailyPlan, migrateLegacy, normalizeData } from './coach.js';
import { EVENT_INTENTS, EVENT_PATHWAYS, EVENT_TYPES } from './events.js';

export const STORAGE_KEY = 'northstar.coach.v2';
export const LEGACY_KEY = 'northstar.data.v1';
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

let lastRecoveryTimestamp = 0;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message) {
  throw new Error(`Invalid Northstar backup: ${message}`);
}

function text(value, name, { required = false, max = 10000 } = {}) {
  if (value === undefined && !required) return;
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    fail(`${name} must be ${required ? 'a nonempty' : 'a'} string of at most ${max} characters.`);
  }
}

function number(value, name, min, max, { optional = true, integer = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    fail(`${name} is outside its supported range.`);
  }
}

function date(value, name, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${name} is not a calendar date.`);
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  if (year < 1900 || year > 2200 || parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    fail(`${name} is not a possible calendar date.`);
  }
}

function timestamp(value, name, { optional = true } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return;
  if (typeof value !== 'string' || !value.includes('T') || !Number.isFinite(new Date(value).getTime())) {
    fail(`${name} is not a valid timestamp.`);
  }
  date(value.slice(0, 10), name);
}

function list(value, name, inspect, { optional = false, key = 'id', max = 10000 } = {}) {
  if (value === undefined && optional) return;
  if (!Array.isArray(value) || value.length > max) fail(`${name} must be a supported list.`);
  const ids = new Set();
  for (const [index, record] of value.entries()) {
    const path = `${name}[${index}]`;
    if (!object(record)) fail(`${path} must be an object.`);
    if (key) {
      text(record[key], `${path}.${key}`, { required: true, max: 200 });
      if (ids.has(record[key].trim())) fail(`${name} contains duplicate ${key} values.`);
      ids.add(record[key].trim());
    }
    inspect(record, path);
  }
}

function stringList(value, name, { optional = true, max = 1000, itemMax = 1000, unique = false } = {}) {
  if (value === undefined && optional) return;
  if (!Array.isArray(value) || value.length > max) fail(`${name} must be a supported string list.`);
  for (const [index, item] of value.entries()) text(item, `${name}[${index}]`, { required: true, max: itemMax });
  if (unique && new Set(value.map(item => item.trim())).size !== value.length) fail(`${name} contains duplicate values.`);
}

function boolean(value, name, { optional = true } = {}) {
  if (value === undefined && optional) return;
  if (typeof value !== 'boolean') fail(`${name} must be true or false.`);
}

function choice(value, name, choices, { optional = true } = {}) {
  if (value === undefined && optional) return;
  if (!choices.includes(value)) fail(`${name} is not a supported value.`);
}

function webAddress(value, name, max = 1000) {
  text(value, name, { max });
  if (!value) return;
  try {
    if (!['http:', 'https:'].includes(new URL(value).protocol)) fail(`${name} must use HTTPS or HTTP.`);
  } catch { fail(`${name} is not a supported web address.`); }
}

function validateProfile(profile, legacy = false) {
  if (!object(profile)) fail('profile must be an object.');
  for (const field of ['name', 'schoolYear', 'schoolSystem', 'major', 'gradeGoal', 'language']) {
    if (profile[field] !== undefined) text(profile[field], `profile.${field}`, { max: field === 'gradeGoal' ? 600 : 200 });
  }
  if (legacy) {
    for (const field of ['graduationYear', 'applicationYear']) text(profile[field], `profile.${field}`, { max: 300 });
    text(profile.subjects, 'profile.subjects', { max: 1000 });
    number(profile.dailyMinutes, 'profile.dailyMinutes', 0, 1440);
  } else {
    for (const field of ['graduationYear', 'applicationYear', 'universityStartYear']) {
      const year = profile[field];
      if (year === undefined || year === null || year === '') continue;
      if (typeof year === 'number') number(year, `profile.${field}`, 1900, 2200, { optional: false, integer: true });
      else if (typeof year !== 'string' || !/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 2200) fail(`profile.${field} is not a supported year.`);
    }
    for (const field of ['targetFields', 'pathways']) stringList(profile[field], `profile.${field}`, { max: 40, itemMax: 200, unique: true });
    for (const pathway of profile.pathways ?? []) choice(pathway, 'profile.pathways', ['USA', 'Germany'], { optional: false });
    choice(profile.theme, 'profile.theme', ['system', 'light', 'dark']);
    for (const field of ['englishLevel', 'germanLevel', 'theme']) text(profile[field], `profile.${field}`, { max: 300 });
    text(profile.academicGoalNotes, 'profile.academicGoalNotes', { max: 600 });
    list(profile.testPlans, 'profile.testPlans', (record, path) => {
      text(record.name, `${path}.name`, { required: true, max: 100 });
      date(record.targetDate, `${path}.targetDate`, { optional: true });
      for (const field of ['status', 'targetScore']) text(record[field], `${path}.${field}`, { max: 100 });
      text(record.notes, `${path}.notes`, { max: 2000 });
    }, { optional: true });
  }
}

function validateTask(task, path, legacy = false) {
  text(task.title, `${path}.title`, { required: true, max: 300 });
  date(task.date, `${path}.date`);
  text(task.category, `${path}.category`, { max: 200 });
  choice(task.category, `${path}.category`, legacy ? ['academics', 'languages', 'confidence', 'wellbeing', 'activities', 'reflection'] : ['academics', 'language', 'university', 'activity', 'review']);
  number(task.minutes, `${path}.minutes`, 1, legacy ? 480 : 720, { optional: false, integer: true });
  boolean(task.completed, `${path}.completed`);
  if (!legacy) {
    boolean(task.skipped, `${path}.skipped`);
    if (task.skipped && task.completed) fail(`${path} cannot be both skipped and completed.`);
  }
  timestamp(task.completedAt, `${path}.completedAt`);
  if (task.completed === true && !task.completedAt) fail(`${path} is completed without a completion timestamp.`);
  if (legacy && task.completedAt && task.completed !== true) fail(`${path} has a completion timestamp without completion.`);
}

function validateGrade(grade, path, legacy = false) {
  if (legacy) text(grade.subject, `${path}.subject`, { required: true, max: 300 });
  else text(grade.subjectId, `${path}.subjectId`, { required: true, max: 200 });
  number(grade.points, `${path}.points`, 0, 15, { optional: false });
  date(grade.date, `${path}.date`);
  text(grade.note, `${path}.note`, { max: 3000 });
}

function validateLegacy(value) {
  validateProfile(value.profile, true);
  list(value.tasks, 'tasks', (record, path) => validateTask(record, path, true));
  list(value.grades, 'grades', (record, path) => validateGrade(record, path, true), { optional: true });
  list(value.reflections, 'reflections', (record, path) => {
    date(record.date, `${path}.date`);
    for (const field of ['achieved', 'next', 'gratitude', 'intention']) text(record[field], `${path}.${field}`, { max: 10000 });
  }, { optional: true, key: 'date' });
  list(value.milestones, 'milestones', (record, path) => boolean(record.completed, `${path}.completed`), { optional: true });
  if (value.generatedPlanDates !== undefined) {
    stringList(value.generatedPlanDates, 'generatedPlanDates');
    for (const item of value.generatedPlanDates) date(item, 'generatedPlanDates');
    if (new Set(value.generatedPlanDates).size !== value.generatedPlanDates.length) fail('generatedPlanDates contains duplicate dates.');
  }
}

function validateCurrent(value) {
  validateProfile(value.profile);
  date(value.createdDate, 'createdDate');
  boolean(value.onboardingCompleted, 'onboardingCompleted');
  boolean(value.demo, 'demo');
  list(value.tasks, 'tasks', (record, path) => {
    validateTask(record, path);
    for (const field of ['why', 'reason', 'priority', 'source', 'sourceId', 'subjectId', 'examId', 'activityId']) {
      if (field === 'priority' && typeof record[field] === 'number') number(record[field], `${path}.${field}`, 0, 10000);
      else text(record[field], `${path}.${field}`, { max: 10000 });
    }
    text(record.reason, `${path}.reason`, { max: 1200 });
    text(record.notes, `${path}.notes`, { max: 5000 });
    for (const field of ['goalId', 'eventSourceId', 'roadmapItemId', 'roadmapStepId']) text(record[field], `${path}.${field}`, { max: 200 });
    text(record.eventId, `${path}.eventId`, { max: 220 });
    text(record.eventStage, `${path}.eventStage`, { max: 100 });
    text(record.linkedGoal, `${path}.linkedGoal`, { max: 400 });
    stringList(record.selfReview, `${path}.selfReview`, { max: 12, itemMax: 150, unique: true });
    text(record.resource, `${path}.resource`, { max: 1000 });
    stringList(record.steps, `${path}.steps`, { max: 12, itemMax: 200, unique: true });
    text(record.revisionPlanId, `${path}.revisionPlanId`, { max: 220 });
    text(record.revisionStage, `${path}.revisionStage`, { max: 100 });
    text(record.planSignature, `${path}.planSignature`, { max: 100 });
    if (record.sessions !== undefined) {
      if (!Array.isArray(record.sessions) || record.sessions.length > 20) fail(`${path}.sessions must contain at most 20 study blocks.`);
      let previousEnd = -1;
      for (const [index, session] of record.sessions.entries()) {
        const sessionPath = `${path}.sessions[${index}]`;
        if (!object(session)) fail(`${sessionPath} must be an object.`);
        const start = time(session.start, `${sessionPath}.start`);
        const end = time(session.end, `${sessionPath}.end`);
        if (end <= start || start < previousEnd) fail(`${sessionPath} overlaps or ends before it starts.`);
        previousEnd = end;
      }
    }
    if (record.start || record.end) {
      if (!(time(record.end, `${path}.end`) > time(record.start, `${path}.start`))) fail(`${path} must end after it starts.`);
    }
    date(record.completedDate, `${path}.completedDate`, { optional: true });
    choice(record.priority, `${path}.priority`, ['high', 'medium', 'low']);
    choice(record.origin, `${path}.origin`, ['generated', 'custom']);
  });
  list(value.subjects, 'subjects', (record, path) => {
    text(record.name, `${path}.name`, { required: true, max: 150 });
    text(record.level, `${path}.level`, { max: 200 });
    choice(record.level, `${path}.level`, ['LK', 'GK']);
    for (const field of ['written', 'oral', 'target', 'baselineWritten', 'baselineOral']) number(record[field], `${path}.${field}`, 0, 15);
    stringList(record.weakTopics, `${path}.weakTopics`, { max: 40, itemMax: 200, unique: true });
    boolean(record.enabled, `${path}.enabled`);
  });
  list(value.grades, 'grades', validateGrade);
  list(value.exams, 'exams', (record, path) => {
    text(record.title, `${path}.title`, { required: true, max: 300 });
    text(record.subjectId, `${path}.subjectId`, { required: true, max: 200 });
    date(record.date, `${path}.date`);
    date(record.createdDate, `${path}.createdDate`, { optional: true });
    stringList(record.topics, `${path}.topics`, { max: 40, itemMax: 200, unique: true });
    text(record.format, `${path}.format`, { max: 200 });
    choice(record.format, `${path}.format`, ['written', 'oral', 'test', 'practical']);
    number(record.target, `${path}.target`, 0, 15);
  });
  list(value.activities, 'activities', (record, path) => {
    text(record.name, `${path}.name`, { required: true, max: 300 });
    text(record.type, `${path}.type`, { max: 100 });
    date(record.startDate, `${path}.startDate`, { optional: true });
    date(record.endDate, `${path}.endDate`, { optional: true });
    date(record.updatedDate, `${path}.updatedDate`, { optional: true });
    if (record.startDate && record.endDate && record.endDate < record.startDate) fail(`${path}.endDate must be on or after its start date.`);
    number(record.hoursPerWeek, `${path}.hoursPerWeek`, 0, 168);
    number(record.weeksPerYear, `${path}.weeksPerYear`, 0, 52, { integer: true });
    for (const field of ['description', 'achievements', 'responsibilities', 'notes']) text(record[field], `${path}.${field}`, { max: 4000 });
    text(record.impact, `${path}.impact`, { max: 2000 });
  });
  // New custom milestones are optional in old v2 backups. Existing exams,
  // university deadlines and test plans remain in their canonical collections.
  list(value.events, 'events', (record, path) => {
    text(record.title, `${path}.title`, { required: true, max: 300 });
    choice(record.type, `${path}.type`, EVENT_TYPES, { optional: false });
    date(record.date, `${path}.date`);
    date(record.endDate, `${path}.endDate`, { optional: true });
    date(record.createdDate, `${path}.createdDate`, { optional: true });
    if (record.endDate && record.endDate < record.date) fail(`${path}.endDate must be on or after its event date.`);
    choice(record.intent, `${path}.intent`, EVENT_INTENTS);
    choice(record.pathway, `${path}.pathway`, EVENT_PATHWAYS, { optional: false });
    number(record.minutes, `${path}.minutes`, 5, 120, { optional: false, integer: true });
    choice(record.priority, `${path}.priority`, ['high', 'medium', 'low'], { optional: false });
    choice(record.status, `${path}.status`, ['planned', 'completed'], { optional: false });
    text(record.notes, `${path}.notes`, { max: 4000 });
    text(record.goalId, `${path}.goalId`, { max: 200 });
    webAddress(record.resource, `${path}.resource`);
  }, { optional: true });
  list(value.universities, 'universities', (record, path) => {
    text(record.name, `${path}.name`, { required: true, max: 300 });
    date(record.deadline, `${path}.deadline`, { optional: true });
    for (const field of ['country', 'status']) text(record[field], `${path}.${field}`, { max: 100 });
    choice(record.country, `${path}.country`, ['USA', 'Germany']);
    choice(record.status, `${path}.status`, ['researching', 'shortlisted', 'applied']);
    text(record.program, `${path}.program`, { max: 300 });
    for (const field of ['requirements', 'notes']) text(record[field], `${path}.${field}`, { max: 4000 });
    text(record.url, `${path}.url`, { max: 1200 });
    if (record.url) {
      try { if (!['https:', 'http:'].includes(new URL(record.url).protocol)) fail(`${path}.url must use HTTPS or HTTP.`); }
      catch { fail(`${path}.url is not a supported web address.`); }
    }
  });
  list(value.reflections, 'reflections', (record, path) => {
    date(record.date, `${path}.date`);
    for (const field of ['achieved', 'next', 'gratitude', 'intention']) text(record[field], `${path}.${field}`, { max: 4000 });
  }, { key: 'date' });
  list(value.weeklyReviews, 'weeklyReviews', (record, path) => {
    date(record.weekStart, `${path}.weekStart`);
    if (new Date(`${record.weekStart}T12:00:00`).getDay() !== 1) fail(`${path}.weekStart must be a Monday.`);
    text(record.reflection, `${path}.reflection`, { max: 4000 });
    text(record.focusSubjectId, `${path}.focusSubjectId`, { max: 150 });
    text(record.effort, `${path}.effort`, { max: 100 });
    timestamp(record.completedAt, `${path}.completedAt`);
  }, { key: 'weekStart', max: 1000 });
  list(value.legacyMilestones, 'legacyMilestones', (record, path) => {
    text(record.title, `${path}.title`, { max: 300 });
    text(record.description, `${path}.description`, { max: 4000 });
    text(record.category, `${path}.category`, { max: 100 });
    boolean(record.completed, `${path}.completed`);
  }, { optional: true });
  stringList(value.roadmapCompleted, 'roadmapCompleted', { optional: false, max: 300, itemMax: 200, unique: true });
  stringList(value.dismissedTaskIds, 'dismissedTaskIds', { optional: false, max: 3000, itemMax: 200, unique: true });
  validateSchedule(value.schedule);
  validateStudy(value.study);
}

function studyTimestamp(value, name) {
  timestamp(value, name, { optional: false });
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) {
    fail(`${name} must contain a timestamp with a time zone.`);
  }
  return new Date(value).getTime();
}

function validateStudyRecord(record, path, completed) {
  text(record.id, `${path}.id`, { required: true, max: 200 });
  text(record.taskId, `${path}.taskId`, { required: true, max: 200 });
  text(record.taskTitle, `${path}.taskTitle`, { required: true, max: 300 });
  text(record.subjectId, `${path}.subjectId`, { max: 200 });
  choice(record.category, `${path}.category`, ['academics', 'language', 'university', 'activity', 'review'], { optional: false });
  number(record.targetSeconds, `${path}.targetSeconds`, 300, 10800, { optional: false, integer: true });
  const start = studyTimestamp(record.startedAt, `${path}.startedAt`);
  text(record.timeZone, `${path}.timeZone`, { required: true, max: 100 });
  try { new Intl.DateTimeFormat('en', { timeZone: record.timeZone }).format(0); }
  catch { fail(`${path}.timeZone is not a supported time zone.`); }
  if (!Array.isArray(record.intervals) || record.intervals.length > 1000) fail(`${path}.intervals must contain supported study intervals.`);
  let lastEnd = start;
  let duration = 0;
  for (const [index, interval] of record.intervals.entries()) {
    const intervalPath = `${path}.intervals[${index}]`;
    if (!object(interval)) fail(`${intervalPath} must be an object.`);
    const intervalStart = studyTimestamp(interval.start, `${intervalPath}.start`);
    const intervalEnd = studyTimestamp(interval.end, `${intervalPath}.end`);
    if (intervalStart < lastEnd || intervalEnd <= intervalStart) fail(`${intervalPath} overlaps or ends before it starts.`);
    lastEnd = intervalEnd;
    duration += intervalEnd - intervalStart;
  }
  if (duration > record.targetSeconds * 1000) fail(`${path} exceeds its configured study duration.`);
  if (completed) {
    const end = studyTimestamp(record.endedAt, `${path}.endedAt`);
    number(record.seconds, `${path}.seconds`, 1, record.targetSeconds, { optional: false, integer: true });
    if (end < lastEnd || record.seconds !== duration / 1000) fail(`${path} contains inconsistent saved study time.`);
    return { start, end };
  }
  if (record.runningSince !== null) {
    const runningSince = studyTimestamp(record.runningSince, `${path}.runningSince`);
    if (runningSince < lastEnd) fail(`${path}.runningSince overlaps a closed interval.`);
  }
  return { start, end: Infinity };
}

/** New data is optional so previously exported v2 backups remain portable. */
function validateStudy(study) {
  if (study === undefined) return;
  if (!object(study)) fail('study must be an object.');
  const spans = [];
  const ids = new Set();
  list(study.sessions, 'study.sessions', (record, path) => {
    ids.add(record.id.trim());
    spans.push(validateStudyRecord(record, path, true));
  });
  if (study.active !== null) {
    if (!object(study.active)) fail('study.active must be an active session or null.');
    const active = validateStudyRecord(study.active, 'study.active', false);
    if (ids.has(study.active.id.trim())) fail('study contains duplicate session IDs.');
    spans.push(active);
  }
  spans.sort((a, b) => a.start - b.start);
  for (let index = 1; index < spans.length; index++) {
    if (spans[index].start < spans[index - 1].end) fail('study sessions overlap in time.');
  }
}

function time(value, name) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) fail(`${name} must contain a valid time.`);
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function validateSchedule(schedule) {
  if (!object(schedule)) fail('schedule must be an object.');
  if (!Array.isArray(schedule.weekly) || schedule.weekly.length !== 7) fail('schedule.weekly must contain exactly seven days.');
  const days = new Set();
  for (const [index, day] of schedule.weekly.entries()) {
    const path = `schedule.weekly[${index}]`;
    if (!object(day)) fail(`${path} must be an object.`);
    number(day.day, `${path}.day`, 0, 6, { optional: false, integer: true });
    if (days.has(day.day)) fail('schedule.weekly contains a duplicate day.');
    days.add(day.day);
    number(day.minutes, `${path}.minutes`, 0, 720, { optional: false, integer: true });
    if (!(time(day.windowEnd, `${path}.windowEnd`) > time(day.windowStart, `${path}.windowStart`))) fail(`${path} must end after it starts.`);
  }
  list(schedule.fixedActivities, 'schedule.fixedActivities', (record, path) => {
    text(record.title, `${path}.title`, { required: true, max: 300 });
    date(record.date, `${path}.date`, { optional: true });
    if (!Array.isArray(record.days) || record.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) fail(`${path}.days must contain weekdays from 0 to 6.`);
    if (new Set(record.days).size !== record.days.length) fail(`${path}.days contains a duplicate weekday.`);
    if (!record.date && !record.days.length) fail(`${path} needs a date or a repeating weekday.`);
    if (!(time(record.end, `${path}.end`) > time(record.start, `${path}.start`))) fail(`${path} must end after it starts.`);
    text(record.category, `${path}.category`, { max: 200 });
  });
  list(schedule.timeOverrides, 'schedule.timeOverrides', (record, path) => {
    date(record.date, `${path}.date`);
    number(record.minutes, `${path}.minutes`, 0, 720, { optional: false, integer: true });
  }, { key: 'date' });
}

function assertRetained(source, normalized, legacy = false) {
  if (!object(normalized) || normalized.version !== 2) fail('normalization did not produce a supported state.');
  for (const field of ['tasks', 'grades', 'reflections', ...(legacy ? [] : ['subjects', 'exams', 'activities', 'universities', 'legacyMilestones', 'events'])]) {
    if (!Array.isArray(source[field])) continue;
    if (!Array.isArray(normalized[field]) || normalized[field].length < source[field].length) fail(`${field} contains a record that cannot be restored.`);
    const key = field === 'reflections' && legacy ? 'date' : 'id';
    for (const record of source[field]) {
      const restored = normalized[field].find((item) => item[key] === record[key]);
      if (!restored) fail(`${field} contains a record that cannot be restored.`);
      if (field === 'tasks' && (restored.completed !== record.completed || (restored.completedAt ? new Date(restored.completedAt).getTime() : null) !== (record.completedAt ? new Date(record.completedAt).getTime() : null))) {
        fail('task completion cannot be restored accurately.');
      }
      if (field === 'grades' && restored.points !== record.points) fail('a grade cannot be restored accurately.');
      if (field === 'subjects') {
        for (const baseline of ['baselineWritten', 'baselineOral']) {
          if (record[baseline] !== undefined && restored[baseline] !== record[baseline]) fail('a starting subject grade cannot be restored accurately.');
        }
      }
      if (field === 'tasks') {
        if (record.skipped !== undefined && restored.skipped !== record.skipped) fail('a skipped task cannot be restored accurately.');
        for (const field of ['goalId', 'eventId', 'eventSourceId', 'eventStage', 'roadmapItemId', 'roadmapStepId', 'linkedGoal']) {
          if (record[field] !== undefined && restored[field] !== record[field].trim()) fail('a linked task goal cannot be restored accurately.');
        }
      }
      if (field === 'activities') {
        for (const field of ['endDate', 'updatedDate', 'responsibilities', 'notes']) {
          if (record[field] !== undefined && restored[field] !== record[field].trim()) fail('activity details cannot be restored accurately.');
        }
      }
      if (field === 'events') {
        for (const [field, value] of Object.entries(record)) {
          if (value === undefined) continue;
          if (JSON.stringify(restored[field]) !== JSON.stringify(value) && !(typeof value === 'string' && restored[field] === value.trim())) fail('an event cannot be restored without changing its contents.');
        }
      }
    }
  }
  if (legacy && Array.isArray(source.milestones)) {
    for (const record of source.milestones) {
      const restored = normalized.legacyMilestones?.find(item => item.id === record.id);
      if (!restored || restored.completed !== record.completed || (record.title && restored.title !== record.title.trim())) {
        fail('legacy milestones cannot be restored accurately.');
      }
    }
  }
  if (legacy && source.profile.gradeGoal && normalized.profile.academicGoalNotes !== source.profile.gradeGoal.trim()) {
    fail('the previous academic goal cannot be restored accurately.');
  }
  if (!legacy) {
    if (source.study !== undefined) {
      if (normalized.study.sessions.length !== source.study.sessions.length || normalized.study.active?.id !== source.study.active?.id) {
        fail('study sessions cannot be restored accurately.');
      }
      for (const record of [...source.study.sessions, ...(source.study.active ? [source.study.active] : [])]) {
        const restored = record === source.study.active ? normalized.study.active : normalized.study.sessions.find(session => session.id === record.id);
        if (!restored || restored.targetSeconds !== record.targetSeconds || restored.seconds !== record.seconds || restored.intervals.length !== record.intervals.length) fail('measured study time cannot be restored accurately.');
        for (const [index, interval] of record.intervals.entries()) {
          if (new Date(restored.intervals[index].start).getTime() !== new Date(interval.start).getTime() || new Date(restored.intervals[index].end).getTime() !== new Date(interval.end).getTime()) fail('study intervals cannot be restored accurately.');
        }
      }
    }
    for (const [path, records, restoredRecords, key] of [
      ['profile.testPlans', source.profile.testPlans, normalized.profile.testPlans, 'id'],
      ['schedule.fixedActivities', source.schedule.fixedActivities, normalized.schedule.fixedActivities, 'id'],
      ['schedule.timeOverrides', source.schedule.timeOverrides, normalized.schedule.timeOverrides, 'date'],
      ['weeklyReviews', source.weeklyReviews, normalized.weeklyReviews, 'weekStart'],
    ]) {
      if (!Array.isArray(records)) continue;
      if (!Array.isArray(restoredRecords) || restoredRecords.length !== records.length) fail(`${path} contains a record that cannot be restored.`);
      for (const record of records) {
        const restored = restoredRecords.find((item) => item[key] === record[key]);
        if (!restored) fail(`${path} contains a record that cannot be restored.`);
        for (const [field, value] of Object.entries(record)) {
          if (value === undefined) continue;
          const sameTimestamp = field.endsWith('At') && value && restored[field] && new Date(value).getTime() === new Date(restored[field]).getTime();
          if (JSON.stringify(restored[field]) !== JSON.stringify(value) && !(typeof value === 'string' && restored[field] === value.trim()) && !sameTimestamp) {
            fail(`${path}.${field} cannot be restored without changing its contents.`);
          }
        }
      }
    }
  }
  return normalized;
}

/** Import checks every source record before normalization can discard it. */
export function parseBackup(content, today) {
  if (typeof content !== 'string') fail('the backup must contain JSON text.');
  if (new TextEncoder().encode(content).byteLength > MAX_BACKUP_BYTES) fail('the file is larger than 20 MB.');
  let value;
  try { value = JSON.parse(content); } catch { fail('the file is not valid JSON.'); }
  if (!object(value)) fail('the file must contain a state object.');
  if (value.version === 1) {
    validateLegacy(value);
    return assertRetained(value, migrateLegacy(value, today), true);
  }
  if (value.version !== 2) fail('this backup version is not supported.');
  validateCurrent(value);
  return assertRetained(value, normalizeData(value, today));
}

/** Plain, portable JSON; no local storage metadata or device identifiers. */
export function serializeBackup(data) {
  const content = JSON.stringify(data, null, 2);
  parseBackup(content, data?.createdDate);
  return content;
}

function fallback(today) {
  return ensureDailyPlan(createPersonalProfile({ today }), today);
}

/** Read-only loading lets the UI decide when it is safe to autosave. */
export function loadData(storage, today) {
  let raw;
  let key = STORAGE_KEY;
  try {
    raw = storage.getItem(STORAGE_KEY);
    if (raw === null) {
      key = LEGACY_KEY;
      raw = storage.getItem(LEGACY_KEY);
    }
  } catch {
    return { data: fallback(today), warning: 'This browser cannot read saved data. Changes cannot be saved here; export a backup before closing.', writable: false };
  }
  if (raw === null) return { data: fallback(today), warning: '', writable: true };
  try {
    const data = ensureDailyPlan(parseBackup(raw, today), today);
    return { data, warning: key === LEGACY_KEY ? 'Your previous Northstar data was upgraded. The original remains saved on this device.' : '', writable: true };
  } catch {
    try {
      lastRecoveryTimestamp = Math.max(Date.now(), lastRecoveryTimestamp + 1);
      const recoveryKey = `${key}.recovery.${lastRecoveryTimestamp}`;
      storage.setItem(recoveryKey, raw);
      return { data: fallback(today), warning: 'We could not open your saved plan. Your original data is preserved; your starting profile is open.', recoveryKey, writable: true };
    } catch {
      return { data: fallback(today), warning: 'Saved data could not be read, and a recovery copy could not be saved. Automatic saving is paused to protect the original; export any new work before closing.', writable: false };
    }
  }
}

export function saveData(data, storage) {
  try {
    storage.setItem(STORAGE_KEY, serializeBackup(data));
    return { ok: true, error: '' };
  } catch (error) {
    return { ok: false, error: error?.message?.startsWith('Invalid Northstar backup:') ? error.message : 'This browser could not save your changes. Storage may be full or unavailable; export a backup before closing.' };
  }
}
