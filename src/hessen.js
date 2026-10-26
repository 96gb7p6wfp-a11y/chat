/**
 * Hessen planning scenarios from the user's supplied rules, NOT a verified OAVO
 * implementation. Official hosts were unavailable during research. Sources stay
 * unverified and eligibility stays incomplete until a reviewed rule set exists.
 *
 * Additive data.hessen schema: courseSettings[], semesterResults[],
 * examinationSubjects[5], targetPoints, regulatoryReview. Individual assessment
 * records in data.grades and undated subject baselines NEVER become semester
 * results or Abitur points automatically.
 */
export const HESSEN_SEMESTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
export const HESSEN_SOURCES = [
  { id: 'school-law', title: 'Hessen · Schulrecht / geltende OAVO prüfen', url: 'https://kultus.hessen.de/schulsystem/schulrecht', status: 'unverified', verifiedAt: null },
  { id: 'abitur-2028', title: 'Abiturerlass 2028', url: 'https://kultus.hessen.de/sites/kultus.hessen.de/files/2026-07/abiturerlass_2028.pdf', status: 'unverified', verifiedAt: null },
  { id: 'oavo-2025', title: 'OAVO-Änderung · Juni 2025', url: 'https://verkuendung.hessen.de/sites/verkuendung.hessen.de/files/veroeffentlichungsplattform_plugin/published/933/GVBl_2025_Nr_32_Regelungstext.pdf', status: 'unverified', verifiedAt: null },
  { id: 'kcgo', title: 'Hessen · Kerncurricula der gymnasialen Oberstufe', url: 'https://kultus.hessen.de/unterricht/kerncurricula-und-lehrplaene/kerncurricula/kerncurricula-fuer-die-gymnasiale-oberstufe-kcgo', status: 'unverified', verifiedAt: null },
];
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = (value, min, max, integer = false) => value !== '' && value !== null && value !== undefined && typeof value !== 'boolean' && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max && (!integer || Number.isInteger(Number(value))) ? Number(value) : null;
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
};
const records = (value, convert, max = 1000) => {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).slice(0, max).flatMap((entry, index) => {
    const result = convert(object(entry), index);
    if (!result || seen.has(result.id)) return [];
    seen.add(result.id);
    return [result];
  });
};

export function normalizeHessen(value = {}) {
  const input = object(value);
  const seenCourses = new Set();
  const courseSettings = (Array.isArray(input.courseSettings) ? input.courseSettings : []).slice(0, 100).flatMap(raw => {
    const entry = object(raw), subjectId = text(entry.subjectId, 150), semester = HESSEN_SEMESTERS.includes(entry.semester) ? entry.semester : '';
    const key = `${subjectId}-${semester}`;
    if (!subjectId || seenCourses.has(key)) return [];
    seenCourses.add(key);
    return [{ subjectId, semester, weeklyHours: number(entry.weeklyHours, 1, 10), countOverride: number(entry.countOverride, 0, 10, true), teacherConfirmed: entry.teacherConfirmed === true,
      replacements: records(entry.replacements, (replacement, index) => ({ id: text(replacement.id, 150) || `replacement-${index}`, kind: ['presentation', 'oral-communication', 'practical', 'other'].includes(replacement.kind) ? replacement.kind : 'other', count: number(replacement.count, 1, 10, true) || 1, note: text(replacement.note, 2000) }), 20), note: text(entry.note, 3000) }];
  });
  const semesterResults = records(input.semesterResults, entry => {
    const id = text(entry.id, 150), subjectId = text(entry.subjectId, 150);
    if (!id || !subjectId || !HESSEN_SEMESTERS.includes(entry.semester)) return null;
    const status = entry.status === 'confirmed' ? 'confirmed' : 'scenario';
    const inclusion = ['mandatory', 'optional', 'excluded'].includes(entry.inclusion) ? entry.inclusion : 'optional';
    return { id, subjectId, semester: entry.semester, points: number(entry.points, 0, 15, status === 'confirmed'), status, inclusion, included: inclusion === 'mandatory' || (inclusion !== 'excluded' && entry.included === true) };
  });
  const examinationSubjects = [1, 2, 3, 4, 5].map(slot => {
    const entry = object((Array.isArray(input.examinationSubjects) ? input.examinationSubjects : []).find(item => item?.slot === slot));
    const status = entry.status === 'confirmed' ? 'confirmed' : 'scenario';
    return { slot, subjectId: Object.hasOwn(entry, 'subjectId') ? text(entry.subjectId, 150) : slot === 1 ? 'mathematics' : slot === 2 ? 'physics' : '', points: number(entry.points, 0, 15, status === 'confirmed'), status, mode: ['written', 'oral', 'presentation'].includes(entry.mode) ? entry.mode : slot <= 3 ? 'written' : 'oral' };
  });
  const review = object(input.regulatoryReview);
  return { courseSettings, semesterResults, examinationSubjects, targetPoints: number(input.targetPoints, 0, 900), regulatoryReview: { confirmed: review.confirmed === true, checkedDate: date(review.checkedDate), note: text(review.note, 4000) } };
}

/** Arithmetic and data consistency only. No automatic mandatory-course choice. */
export function calculateAbitur(data = {}) {
  const config = normalizeHessen(data.hessen), subjects = data.subjects || [];
  const byId = new Map(subjects.map(subject => [subject.id, subject]));
  const issues = [], seenTerms = new Set();
  const included = config.semesterResults.filter(result => result.included);
  const valid = [];
  for (const result of included) {
    const subject = byId.get(result.subjectId);
    if (!subject) { issues.push({ code: 'unknown-subject', subjectId: result.subjectId, message: 'Eine eingebrachte Halbjahresnote verweist auf ein unbekanntes Fach.' }); continue; }
    const key = `${result.subjectId}-${result.semester}`;
    if (seenTerms.has(key)) { issues.push({ code: 'duplicate-semester', subjectId: result.subjectId, semester: result.semester, message: 'Für ein Fach und Halbjahr sind mehrere eingebrachte Ergebnisse ausgewählt. Wähle genau eines.' }); continue; }
    seenTerms.add(key);
    valid.push({ ...result, level: subject.level === 'LK' ? 'LK' : 'GK', factor: subject.level === 'LK' ? 2 : 1 });
  }
  const lk = valid.filter(result => result.level === 'LK'), gk = valid.filter(result => result.level === 'GK');
  const knownPoints = valid.reduce((sum, result) => sum + (result.points ?? 0) * result.factor, 0);
  const missingPointsCount = valid.filter(result => result.points === null).length;
  if (lk.length !== 8) issues.push({ code: 'lk-count', message: `${lk.length} von 8 vorgesehenen LK-Halbjahresergebnissen ausgewählt.` });
  if (gk.length !== 24) issues.push({ code: 'gk-count', message: `${gk.length} von 24 vorgesehenen GK-Halbjahresergebnissen ausgewählt. Nicht jeder besuchte Kurs wird automatisch eingebracht.` });
  if (missingPointsCount) issues.push({ code: 'semester-points-missing', message: `${missingPointsCount} ausgewählte Halbjahresergebnisse sind noch offen.` });
  const lkSubjects = subjects.filter(subject => subject.level === 'LK');
  if (lkSubjects.length !== 2) issues.push({ code: 'lk-subject-count', message: 'Für dieses 8-LK-Szenario werden zwei Leistungskurse benötigt.' });
  for (const subject of lkSubjects) for (const semester of HESSEN_SEMESTERS) if (!lk.some(result => result.subjectId === subject.id && result.semester === semester)) issues.push({ code: 'lk-semester-missing', subjectId: subject.id, semester, message: `${subject.name || subject.id} · ${semester}: LK-Ergebnis noch nicht eingebracht.` });
  const chosen = config.examinationSubjects.filter(exam => exam.subjectId);
  const examIds = new Set();
  for (const exam of chosen) {
    if (!byId.has(exam.subjectId)) issues.push({ code: 'unknown-exam-subject', slot: exam.slot, message: `Prüfungsfach ${exam.slot} ist im Fachprofil nicht vorhanden.` });
    if (examIds.has(exam.subjectId)) issues.push({ code: 'duplicate-exam-subject', slot: exam.slot, message: 'Ein Fach ist mehrfach als Abiturprüfungsfach ausgewählt.' });
    examIds.add(exam.subjectId);
    if (exam.slot <= 2 && byId.get(exam.subjectId)?.level !== 'LK') issues.push({ code: 'lk-exam-subject', slot: exam.slot, message: 'Die ersten beiden Prüfungsplätze sind in diesem Szenario für die Leistungskurse vorgesehen.' });
  }
  if (chosen.length !== 5) issues.push({ code: 'exam-subjects-open', message: 'Dein drittes, viertes und fünftes Prüfungsfach bleiben offen, bis du sie auswählst.' });
  if (chosen.some(exam => exam.points === null)) issues.push({ code: 'exam-points-missing', message: 'Für ausgewählte Prüfungsfächer fehlen noch Ergebnisse oder ausdrückliche Szenariowerte.' });
  const examKnownPoints = chosen.reduce((sum, exam) => sum + (exam.points ?? 0) * 4, 0);
  const blockIInvalid = issues.some(issue => ['unknown-subject', 'duplicate-semester', 'lk-count', 'gk-count', 'semester-points-missing', 'lk-subject-count', 'lk-semester-missing'].includes(issue.code));
  const blockIIInvalid = issues.some(issue => ['unknown-exam-subject', 'duplicate-exam-subject', 'lk-exam-subject', 'exam-subjects-open', 'exam-points-missing'].includes(issue.code));
  const blockI = { points: blockIInvalid ? null : knownPoints, knownPoints, maxPoints: 600, lkCount: lk.length, gkCount: gk.length, confirmedCount: valid.filter(result => result.status === 'confirmed' && result.points !== null).length, scenarioCount: valid.filter(result => result.status === 'scenario' && result.points !== null).length, missingPointsCount, included: valid };
  const blockII = { points: blockIIInvalid ? null : examKnownPoints, knownPoints: examKnownPoints, maxPoints: 300, count: chosen.length, confirmedCount: chosen.filter(exam => exam.status === 'confirmed' && exam.points !== null).length, scenarioCount: chosen.filter(exam => exam.status === 'scenario' && exam.points !== null).length };
  const totalPoints = blockI.points === null || blockII.points === null ? null : blockI.points + blockII.points;
  const timeline = HESSEN_SEMESTERS.map(semester => { const results = valid.filter(result => result.semester === semester); return { semester, confirmed: results.filter(result => result.status === 'confirmed' && result.points !== null).length, scenarios: results.filter(result => result.status === 'scenario' && result.points !== null).length, included: results.length, contribution: results.reduce((sum, result) => sum + (result.points ?? 0) * result.factor, 0) }; });
  return { config, blockI, blockII, totalPoints, targetPoints: config.targetPoints, targetGap: totalPoints !== null && config.targetPoints !== null ? config.targetPoints - totalPoints : null, issues,
    regulatoryValidation: { status: 'unverified', complete: false, message: 'Rechenszenario nach deinen Vorgaben. Amtliche Einbringungspflichten, Prüfungsfachkombinationen, Mindestpunkte und Unterkursgrenzen für 2028 sind noch nicht quellengeprüft. Keine Zulassungs- oder Bestehensbestätigung.' }, timeline, sources: HESSEN_SOURCES, verifiedAt: null };
}

function timetableHours(data, subjectId, semester) {
  const lessons = (data.schedule?.lessons || []).filter(lesson => lesson.subjectId === subjectId && (!lesson.term || lesson.term.includes(semester)));
  if (!lessons.length || lessons.some(lesson => !Number.isInteger(lesson.periodStart) || !Number.isInteger(lesson.periodEnd))) return null;
  // A/B alternatives represent the weekly load in each cycle, never their sum.
  const sum = cycle => lessons.filter(lesson => !lesson.cycle || lesson.cycle === 'all' || lesson.cycle === cycle).reduce((total, lesson) => total + lesson.periodEnd - lesson.periodStart + 1, 0);
  const a = sum('A'), b = sum('B');
  return a === b && a >= 1 && a <= 10 ? a : null;
}

/** Provisional count rules supplied by the user. No unknown exam dates created. */
export function courseAssessmentPlan(data = {}, subjectId, semester = data.profile?.schoolYear || 'Q1') {
  const subject = (data.subjects || []).find(item => item.id === subjectId);
  const settings = normalizeHessen(data.hessen).courseSettings;
  const config = settings.find(item => item.subjectId === subjectId && item.semester === semester);
  const general = settings.find(item => item.subjectId === subjectId && !item.semester);
  const measuredHours = timetableHours(data, subjectId, semester);
  const contextHours = subjectId === 'english' ? 3 : subjectId === 'german' ? 4 : null;
  const hourSetting = config?.weeklyHours !== null && config?.weeklyHours !== undefined ? config : general?.weeklyHours !== null && general?.weeklyHours !== undefined ? general : null;
  const weeklyHours = hourSetting?.weeklyHours ?? measuredHours ?? contextHours;
  const hoursSource = hourSetting ? hourSetting.teacherConfirmed ? 'teacher' : 'user' : measuredHours !== null ? 'timetable' : contextHours !== null ? 'user-context' : 'unknown';
  const level = subject?.level === 'LK' ? 'LK' : 'GK';
  let expected = !HESSEN_SEMESTERS.includes(semester) || !subject ? null : semester === 'Q4' ? 1 : level === 'LK' ? 2 : weeklyHours === 4 ? 2 : weeklyHours === 2 || weeklyHours === 3 ? 1 : null;
  const exceptionApplied = config?.teacherConfirmed === true && config?.countOverride !== null && config?.countOverride !== undefined;
  if (exceptionApplied) expected = config.countOverride;
  const scheduled = (data.exams || []).filter(exam => {
    if (exam.subjectId !== subjectId || (exam.format && exam.format !== 'written')) return false;
    // An explicitly assigned semester takes precedence over legacy labels.
    if (HESSEN_SEMESTERS.includes(exam.semester)) return exam.semester === semester;
    return new RegExp(`\\b${semester}\\b`, 'i').test(exam.title || '') || (semester === 'Q1' && /^q1-hessen-2026/.test(exam.importKey || ''));
  });
  const replacementCount = config?.teacherConfirmed === true ? (config.replacements || []).reduce((sum, entry) => sum + entry.count, 0) : 0;
  const unscheduledCount = expected === null ? null : Math.max(0, expected - scheduled.length - replacementCount);
  const additionalMessage = unscheduledCount === 1 ? 'Eine weitere Klausur vorgesehen — Termin noch offen.' : unscheduledCount > 1 ? `${unscheduledCount} weitere Klausuren vorgesehen — Termine noch offen.` : expected === null ? 'Kursstunden und Leistungsnachweise mit der Lehrkraft klären.' : '';
  return { subjectId, semester, level, weeklyHours, hoursSource, expected, scheduled, scheduledCount: scheduled.length, replacementCount, unscheduledCount, additionalMessage, provisional: true, exceptionApplied,
    note: config?.note || general?.note || '', sourceStatus: 'unverified', ruleNote: 'Vorläufig nach deinen allgemeinen Vorgaben; zulässige Alternativen und Fachausnahmen sind amtlich noch nicht geprüft. Bestätige die konkrete Kursregel mit deiner Lehrkraft.', replacements: config?.replacements || [], unassignedException: !!general && (general.countOverride !== null || general.replacements.length > 0) };
}

/** Importance stays separate from urgency and never changes a school average. */
export function getHessenImportance(data = {}, subjectId) {
  const config = normalizeHessen(data.hessen), subject = (data.subjects || []).find(item => item.id === subjectId);
  const factor = subject?.level === 'LK' ? 2 : 1;
  const selectedExam = config.examinationSubjects.some(exam => exam.subjectId === subjectId);
  const included = config.semesterResults.filter(result => result.subjectId === subjectId && result.included);
  const mandatoryCount = included.filter(result => result.inclusion === 'mandatory').length;
  return { factor, selectedExam, includedCount: included.length, mandatoryCount, longTermLabel: factor === 2 ? 'Langfristig wichtig · LK' : selectedExam ? 'Gewähltes Abiturprüfungsfach' : mandatoryCount ? 'Von dir als einzubringen markiert' : 'Einbringung noch prüfen',
    reason: factor === 2 ? 'Deine eingebrachten LK-Halbjahresnoten zählen im gewählten Block-I-Szenario doppelt; eine nahe Prüfung kann trotzdem ein anderes Fach dringender machen.' : selectedExam ? 'Dieses Fach ist in deinem Abiturprüfungsszenario ausgewählt.' : mandatoryCount ? 'Du hast Halbjahresergebnisse dieses Fachs als verpflichtend markiert; die amtliche Pflicht ist noch zu prüfen.' : 'Einbringung und Prüfungsfachwahl sind noch nicht amtlich geprüft.', verified: false };
}
