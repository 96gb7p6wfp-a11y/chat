const CATEGORIES = ['academics', 'languages', 'confidence', 'wellbeing', 'activities', 'reflection'];
const DEFAULT_PROFILE = {
  name: '',
  schoolYear: 'Grade 12',
  schoolSystem: 'Germany · public Gymnasium',
  graduationYear: '2028',
  applicationYear: '',
  major: '',
  subjects: 'English, German',
  gradeGoal: '',
  dailyMinutes: 60,
  language: 'en',
};

const MILESTONES = [
  {
    id: 'academic-baseline',
    title: 'Know your academic starting point',
    description: 'Record your current grades, strongest subjects, and the subjects that need help. Choose one improvement you can measure.',
    category: 'academics',
  },
  {
    id: 'coursework-requirements',
    title: 'Check the UC requirements for your school system',
    description: 'Use the official UC admissions pages to check coursework, grades, English-language requirements, and the rules for your applicant type.',
    category: 'academics',
  },
  {
    id: 'grade-habit',
    title: 'Build a repeatable study habit',
    description: 'Practice active recall, get feedback from a teacher, and review mistakes each week. Track understanding as well as grades.',
    category: 'academics',
  },
  {
    id: 'language-habit',
    title: 'Build an English and German practice routine',
    description: 'Practice reading, writing, speaking, and listening in short sessions. Keep examples of your own work and ask for specific feedback.',
    category: 'languages',
  },
  {
    id: 'confidence-habit',
    title: 'Practice small acts of confidence',
    description: 'Try manageable steps such as asking a question or explaining an idea. Notice your effort and learning without judging your worth.',
    category: 'confidence',
  },
  {
    id: 'meaningful-project',
    title: 'Start a project you care about',
    description: 'Choose an activity or project that matches your interests. Take a small first step and keep a record of what you learn.',
    category: 'activities',
  },
  {
    id: 'community-contribution',
    title: 'Make a useful contribution',
    description: 'Find a sustainable way to help your school or community. Keep honest notes on your role, effort, and impact.',
    category: 'activities',
  },
  {
    id: 'experience-record',
    title: 'Keep your experience and achievement record',
    description: 'Write down real responsibilities, achievements, challenges, and lessons. Small consistent contributions count as progress.',
    category: 'reflection',
  },
  {
    id: 'personal-insight',
    title: 'Explore your personal insight stories',
    description: 'Read the current UC personal insight questions and collect examples from your own life. Write in your own voice.',
    category: 'reflection',
  },
  {
    id: 'application-calendar',
    title: 'Make your application and cost calendar',
    description: 'Check current UCLA, UC Berkeley, and UC dates, documents, fees, and financial-aid information. Build a balanced college list; admission is never guaranteed.',
    category: 'academics',
  },
];

function cleanText(value, maxLength = 400) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function wholeNumber(value, fallback, min, max) {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  if (value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2200) return false;
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function calendarDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function shiftDate(dateKey, days) {
  const date = calendarDate(dateKey);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function timestamp(value) {
  if (typeof value !== 'string' || !/T/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function profileFrom(value = {}) {
  const profile = { ...DEFAULT_PROFILE };
  for (const field of ['name', 'schoolYear', 'schoolSystem', 'graduationYear', 'applicationYear', 'major', 'subjects', 'gradeGoal']) {
    const input = typeof value[field] === 'string' ? value[field] : DEFAULT_PROFILE[field];
    profile[field] = cleanText(input, ['subjects', 'gradeGoal'].includes(field) ? 600 : 150);
  }
  profile.dailyMinutes = wholeNumber(value.dailyMinutes, 60, 20, 240);
  profile.language = value.language === 'de' ? 'de' : 'en';
  return profile;
}

function categoryCounts() {
  return Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Calendar date in the device's local timezone, rather than the UTC date. */
export function localDateKey(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError('localDateKey needs a valid Date.');
  }
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function createInitialState() {
  return {
    version: 1,
    profile: { ...DEFAULT_PROFILE },
    tasks: [],
    grades: [],
    reflections: [],
    milestones: MILESTONES.map((milestone) => ({ ...milestone, completed: false })),
    generatedPlanDates: [],
  };
}

/** Normalize saved or imported data. Unverifiable completions are never invented. */
export function normalizeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createInitialState();
  const initial = createInitialState();
  const ids = new Set();
  const tasks = [];
  for (const task of Array.isArray(value.tasks) ? value.tasks.slice(0, 10000) : []) {
    if (!task || typeof task !== 'object') continue;
    const id = cleanText(task.id, 150);
    const title = cleanText(task.title, 300);
    if (!id || !title || ids.has(id) || !isDateKey(task.date)) continue;
    ids.add(id);
    const completedAt = task.completed === true ? timestamp(task.completedAt) : null;
    tasks.push({
      id,
      title,
      category: CATEGORIES.includes(task.category) ? task.category : 'academics',
      date: task.date,
      minutes: wholeNumber(task.minutes, 15, 1, 480),
      completed: completedAt !== null,
      completedAt,
    });
  }
  const reflectionDates = new Map();
  for (const entry of Array.isArray(value.reflections) ? value.reflections.slice(0, 10000) : []) {
    if (!entry || !isDateKey(entry.date)) continue;
    reflectionDates.set(entry.date, {
      date: entry.date,
      achieved: cleanText(entry.achieved, 3000),
      next: cleanText(entry.next, 3000),
      gratitude: cleanText(entry.gratitude, 3000),
      intention: cleanText(entry.intention, 3000),
    });
  }
  const milestoneValues = new Map(
    (Array.isArray(value.milestones) ? value.milestones : [])
      .filter((milestone) => milestone && typeof milestone === 'object')
      .map((milestone) => [milestone.id, milestone.completed === true]),
  );
  const gradeIds = new Set();
  const grades = [];
  for (const grade of Array.isArray(value.grades) ? value.grades.slice(0, 10000) : []) {
    if (!grade || typeof grade !== 'object') continue;
    const id = cleanText(grade.id, 150);
    const subject = cleanText(grade.subject, 150);
    if (!id || gradeIds.has(id) || !subject || !isDateKey(grade.date)
      || typeof grade.points !== 'number' || !Number.isFinite(grade.points)
      || grade.points < 0 || grade.points > 15) continue;
    gradeIds.add(id);
    grades.push({ id, subject, points: grade.points, date: grade.date, note: cleanText(grade.note, 3000) });
  }
  return {
    ...initial,
    profile: profileFrom(value.profile && typeof value.profile === 'object' ? value.profile : {}),
    tasks,
    grades: grades.sort((a, b) => b.date.localeCompare(a.date)),
    reflections: [...reflectionDates.values()].sort((a, b) => b.date.localeCompare(a.date)),
    milestones: initial.milestones.map((milestone) => ({
      ...milestone,
      completed: milestoneValues.get(milestone.id) ?? false,
    })),
    generatedPlanDates: [...new Set(
      (Array.isArray(value.generatedPlanDates) ? value.generatedPlanDates : []).filter(isDateKey),
    )],
  };
}

export function saveProfile(state, patch) {
  return { ...state, profile: profileFrom({ ...state.profile, ...patch }) };
}

export function addTask(state, { title, category = 'academics', date = localDateKey(), minutes = 15 }) {
  const cleanedTitle = cleanText(title, 300);
  if (!cleanedTitle || !isDateKey(date)) return state;
  return {
    ...state,
    tasks: [...state.tasks, {
      id: createId(),
      title: cleanedTitle,
      category: CATEGORIES.includes(category) ? category : 'academics',
      date,
      minutes: wholeNumber(minutes, 15, 1, 480),
      completed: false,
      completedAt: null,
    }],
  };
}

export function makeDailyPlan(state, dateKey = localDateKey()) {
  if (!isDateKey(dateKey) || state.generatedPlanDates.includes(dateKey)) return state;
  const budget = wholeNumber(state.profile.dailyMinutes, 60, 20, 240);
  const [year, month, day] = dateKey.split('-').map(Number);
  // An ordinal of the local calendar fields avoids DST affecting task variation.
  const ordinal = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  const variation = ((ordinal % 3) + 3) % 3;
  const language = ((ordinal % 2) + 2) % 2 === 0 ? 'English' : 'German';
  const subject = cleanText(state.profile.subjects, 600)
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .find((part) => part && !/^(english|englisch|german|deutsch)(?:\s*\([^)]*\))?$/i.test(part));
  const major = cleanText(state.profile.major, 150);
  const academicTopic = subject || 'your toughest school topic';
  const titles = [
    [
      `Practice ${academicTopic} and review your mistakes`,
      `Recall ${academicTopic} without notes, then check what you missed`,
      `Explain one idea from ${academicTopic} and solve a practice question`,
    ][variation],
    [
      `Read a short text in ${language} and summarize it in your own words`,
      `Write a short paragraph in ${language} and revise three sentences`,
      `Explain an idea aloud in ${language} and note one thing to improve`,
    ][variation],
    [
      'Ask one useful question or share one idea with someone',
      'Practice a short introduction or explanation aloud',
      'Take one small, manageable step you have been putting off',
    ][variation],
    [
      'Take a movement break and choose a realistic bedtime',
      'Take a screen-free break, stretch, and prepare your workspace',
      'Move gently, then plan time to rest this evening',
    ][variation],
    major ? `Take one small step on a ${major} project` : 'Explore a subject or project you care about and record one question',
    'Log one achievement and tomorrow’s next step',
  ];
  const weights = [0.35, 0.25, 0.10, 0.15, 0.10, 0.05];
  const exactMinutes = weights.map((weight) => weight * budget);
  const minutes = exactMinutes.map((value) => Math.max(1, Math.floor(value)));
  const allocationOrder = minutes.map((_, index) => index).sort((first, second) =>
    (exactMinutes[second] - minutes[second]) - (exactMinutes[first] - minutes[first]) || first - second);
  let remainder = budget - minutes.reduce((sum, value) => sum + value, 0);
  let allocationIndex = 0;
  while (remainder > 0) {
    minutes[allocationOrder[allocationIndex % allocationOrder.length]] += 1;
    remainder -= 1;
    allocationIndex += 1;
  }
  const recommendations = CATEGORIES.map((category, index) => ({ category, title: titles[index], minutes: minutes[index] }));
  const existingIds = new Set(state.tasks.map((task) => task.id));
  return {
    ...state,
    generatedPlanDates: [...state.generatedPlanDates, dateKey],
    tasks: [...state.tasks, ...recommendations
      .map((task) => ({
        ...task,
        id: `plan-${dateKey}-${task.category}`,
        date: dateKey,
        completed: false,
        completedAt: null,
      }))
      .filter((task) => !existingIds.has(task.id))],
  };
}

export function addGrade(state, { subject, points, note = '', date = localDateKey() }) {
  const cleanedSubject = cleanText(subject, 150);
  if (!cleanedSubject || !isDateKey(date) || typeof points !== 'number'
    || !Number.isFinite(points) || points < 0 || points > 15) return state;
  const grade = { id: createId(), subject: cleanedSubject, points, note: cleanText(note, 3000), date };
  return { ...state, grades: [grade, ...(state.grades || [])].sort((a, b) => b.date.localeCompare(a.date)) };
}

export function toggleTask(state, id, now = new Date()) {
  if (!state.tasks.some((task) => task.id === id)) return state;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Use a valid completion date.');
  return {
    ...state,
    tasks: state.tasks.map((task) => task.id === id ? {
      ...task,
      completed: !task.completed,
      completedAt: task.completed ? null : now.toISOString(),
    } : task),
  };
}

export function deleteTask(state, id) {
  if (!state.tasks.some((task) => task.id === id)) return state;
  return { ...state, tasks: state.tasks.filter((task) => task.id !== id) };
}

export function saveReflection(state, { date = localDateKey(), achieved = '', next = '', gratitude = '', intention = '' }) {
  if (!isDateKey(date)) return state;
  const reflection = {
    date,
    achieved: cleanText(achieved, 3000),
    next: cleanText(next, 3000),
    gratitude: cleanText(gratitude, 3000),
    intention: cleanText(intention, 3000),
  };
  return {
    ...state,
    reflections: [...state.reflections.filter((entry) => entry.date !== date), reflection]
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function toggleMilestone(state, id) {
  if (!state.milestones.some((milestone) => milestone.id === id)) return state;
  return {
    ...state,
    milestones: state.milestones.map((milestone) => milestone.id === id ? {
      ...milestone,
      completed: !milestone.completed,
    } : milestone),
  };
}

export function getStats(state, dateKey = localDateKey()) {
  const selectedDate = isDateKey(dateKey) ? dateKey : localDateKey();
  const monthKey = selectedDate.slice(0, 7);
  const completed = state.tasks.filter((task) => task.completed && timestamp(task.completedAt));
  const completionDate = (task) => localDateKey(new Date(task.completedAt));
  const scheduledToday = state.tasks.filter((task) => task.date === selectedDate);
  const completedToday = completed.filter((task) => completionDate(task) === selectedDate);
  const completedMonth = completed.filter((task) => completionDate(task).startsWith(monthKey));
  const minutes = (tasks) => tasks.reduce((sum, task) => sum + task.minutes, 0);
  const categories = categoryCounts();
  for (const task of completedMonth) {
    if (CATEGORIES.includes(task.category)) categories[task.category] += 1;
  }
  const completedDays = new Set(completed.map(completionDate));
  let cursor = completedDays.has(selectedDate) ? selectedDate : shiftDate(selectedDate, -1);
  let streak = 0;
  while (completedDays.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  const dayFormatter = new Intl.DateTimeFormat(state.profile.language === 'de' ? 'de' : 'en', { weekday: 'short' });
  const weekly7 = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(selectedDate, index - 6);
    const tasks = completed.filter((task) => completionDate(task) === date);
    return { date, label: dayFormatter.format(calendarDate(date)), completed: tasks.length, minutes: minutes(tasks) };
  });
  const recordedGrades = state.grades || [];
  const subjectGroups = new Map();
  for (const grade of recordedGrades) {
    const key = grade.subject.toLocaleLowerCase('en-US');
    if (!subjectGroups.has(key)) subjectGroups.set(key, []);
    subjectGroups.get(key).push(grade);
  }
  const gradeAverage = (grades) => grades.length ? grades.reduce((sum, grade) => sum + grade.points, 0) / grades.length : null;
  const gradeStats = {
    count: recordedGrades.length,
    average: gradeAverage(recordedGrades),
    monthCount: recordedGrades.filter((grade) => grade.date.startsWith(monthKey)).length,
    bySubject: [...subjectGroups.values()].map((grades) => {
      const latest = [...grades].sort((a, b) => b.date.localeCompare(a.date))[0];
      return { subject: latest.subject, count: grades.length, average: gradeAverage(grades), latestPoints: latest.points, latestDate: latest.date };
    }).sort((a, b) => a.subject.localeCompare(b.subject)),
  };
  return {
    today: {
      total: scheduledToday.length,
      scheduledCompleted: scheduledToday.filter((task) => task.completed).length,
      completed: completedToday.length,
      remaining: scheduledToday.filter((task) => !task.completed).length,
      plannedMinutes: minutes(scheduledToday),
      completedMinutes: minutes(completedToday),
    },
    month: { key: monthKey, completed: completedMonth.length, completedMinutes: minutes(completedMonth), categories },
    overall: { completed: completed.length, completedMinutes: minutes(completed) },
    weekly7,
    streak,
    grades: gradeStats,
  };
}
