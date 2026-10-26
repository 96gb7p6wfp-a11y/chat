/** Explainable recommendations. Scores order work; they are not grades or admission odds. */
import { calculateSubject } from './grades.js';
import { lessonBlocks } from './timetable.js';
import { getIELTSCandidates } from './ielts.js';
import { getHessenImportance, normalizeHessen, courseAssessmentPlan } from './hessen.js';

const stamp = date => Date.UTC(...String(date).split('-').map((part, index) => Number(part) - (index === 1 ? 1 : 0)));
const days = (from, to) => Math.round((stamp(to) - stamp(from)) / 86_400_000);
const validPoints = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 15;
const germanName = name => ({ Mathematics: 'Mathematik', Physics: 'Physik', English: 'Englisch', German: 'Deutsch', History: 'Geschichte', 'Politics / Economics': 'Politik / Wirtschaft', 'Computer Science': 'Informatik' }[name] || name);
const format = value => Number.isInteger(value) ? String(value) : value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
function availableStudyMinutes(state, date) {
  const day = new Date(`${date}T12:00:00`).getDay();
  const weekly = state.schedule?.weekly?.find(entry => Number(entry.day) === day);
  const requested = state.schedule?.timeOverrides?.find(entry => entry.date === date)?.minutes ?? weekly?.minutes ?? 60;
  if (!weekly?.windowStart || !weekly?.windowEnd) return requested;
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = minutes(weekly.windowStart), end = minutes(weekly.windowEnd);
  const blocks = [...(state.schedule?.fixedActivities || []).filter(entry => entry.date ? entry.date === date : entry.days?.includes(day)), ...lessonBlocks(state, date)]
    .map(entry => [Math.max(start, minutes(entry.start)), Math.min(end, minutes(entry.end))]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let busy = 0, previousEnd = start;
  for (const [a, b] of blocks) { busy += Math.max(0, b - Math.max(a, previousEnd)); previousEnd = Math.max(previousEnd, b); }
  return Math.max(0, Math.min(requested, end - start - busy));
}

/** Course importance affects study priority, never the academic average. */
export function getSubjectPriorities(state, date) {
  const preferences = state.profile?.prioritySubjects || [];
  const availability = availableStudyMinutes(state, date);
  return (state.subjects || []).filter(subject => subject.enabled !== false).map(subject => {
    const academic = calculateSubject({ ...state, grades: (state.grades || []).filter(grade => grade.date <= date) }, subject.id);
    const confirmedSemester = normalizeHessen(state.hessen).semesterResults.find(result => result.subjectId === subject.id && result.semester === state.profile?.schoolYear && result.status === 'confirmed' && result.points !== null);
    const current = confirmedSemester?.points ?? (validPoints(academic.average) ? academic.average : null);
    const importance = getHessenImportance(state, subject.id);
    const assessmentPlan = courseAssessmentPlan(state, subject.id, state.profile?.schoolYear);
    const target = validPoints(subject.target) ? subject.target : null;
    const records = (state.grades || []).filter(grade => grade.subjectId === subject.id && grade.date <= date);
    const components = academic.source === 'baseline' ? [subject.written, subject.oral].filter(validPoints) : [];
    const gap = target === null ? 0 : Math.max(0, target - (components.length ? Math.min(...components) : current ?? target));
    const exam = (state.exams || []).filter(item => item.subjectId === subject.id && item.date >= date).sort((a, b) => a.date.localeCompare(b.date))[0];
    const until = exam ? days(date, exam.date) : null;
    const deadline = (state.events || []).filter(event => event.subjectId === subject.id && event.date >= date && days(date, event.date) <= 14).sort((a, b) => a.date.localeCompare(b.date))[0];
    const recent = records.slice().sort((a, b) => a.date.localeCompare(b.date));
    const recentHalf = Math.max(1, Math.floor(recent.length / 2));
    const mean = values => values.reduce((sum, grade) => sum + grade.points, 0) / values.length;
    const trend = recent.length >= 3 ? mean(recent.slice(-recentHalf)) - mean(recent.slice(0, recentHalf)) : null;
    const lastPractice = (state.tasks || []).filter(task => task.subjectId === subject.id && task.completed && task.date < date).map(task => task.date).sort().at(-1);
    const sincePractice = lastPractice ? Math.max(0, days(lastPractice, date)) : null;
    const explicit = subject.priority || subject.priorityOverride || 'auto';
    const preferred = preferences.includes(subject.id);
    const difficulty = subject.difficulty !== null && subject.difficulty !== undefined && subject.difficulty !== '' && Number.isFinite(Number(subject.difficulty)) ? Math.max(1, Math.min(5, Number(subject.difficulty))) : 3;
    let score = 48 + gap * 8 + (subject.level === 'LK' ? 8 : 0) + (preferred ? 23 : 0);
    const inclusionBoost = (importance.selectedExam && subject.level !== 'LK' ? 6 : 0) + Math.min(4, importance.mandatoryCount);
    const insufficient = current !== null && current < 5;
    score += inclusionBoost + (insufficient ? 12 : 0);
    score += trend !== null && trend <= -1 ? Math.min(16, -trend * 4) : 0;
    score += sincePractice !== null ? Math.min(12, Math.max(0, sincePractice - 3) * 2) : 0;
    score += (difficulty - 3) * 2 + (Number(subject.preference) || 0) * 5;
    score += explicit === 'high' ? 45 : explicit === 'low' ? -30 : 0;
    if (deadline) score += Math.max(5, 28 - days(date, deadline.date) * 2);
    if (until !== null && until <= 45) score = Math.max(score, (until <= 3 ? 170 : until <= 7 ? 145 : until <= 14 ? 115 : until <= 21 ? 85 : 58) + gap * 3 + (subject.level === 'LK' ? 8 : 0));
    const name = germanName(subject.name);
    let reason = until !== null && until <= 14 ? `${name}${subject.level === 'LK' ? ' (LK)' : ''}: ${exam.title} ${until === 0 ? 'ist heute' : until === 1 ? 'ist morgen' : `ist in ${until} Tagen`}.`
      : explicit === 'high' ? `${name} ist von dir als Schwerpunkt festgelegt.`
        : gap > 0 ? `${name}: ${format(gap)} Punkte Abstand zum Ziel${components.length > 1 ? ' im schwächeren Bereich' : ''}${subject.level === 'LK' ? '; dein Leistungskurs verdient regelmäßige Übung' : ''}.`
          : preferred ? `${name} ist ein persönlicher Schwerpunkt; eine aktuelle Note fehlt noch.`
            : deadline ? `${deadline.title} steht in ${days(date, deadline.date)} Tagen an.`
              : current === null ? `${name}: Mit einer kurzen Übung und Lehrkraft-Feedback klärst du deinen Lernstand.`
                : trend !== null && trend < -1 ? `${name}: Deine neueren Ergebnisse sind schwächer. Bearbeite gezielt einen Fehler.`
                  : `${name}: Regelmäßige Übung erhält deine Fortschritte${sincePractice !== null && sincePractice >= 7 ? `; zuletzt vor ${sincePractice} Tagen` : ''}.`;
    const minutes = availability < 5 ? 0 : Math.min(availability, until !== null && until <= 7 ? 35 : gap >= 3 || preferred ? 30 : 25);
    return { subjectId: subject.id, name, score, reason, current, target, gap, trend, exam, deadline, minutes, sincePractice, level: subject.level, override: explicit,
      importance, assessmentPlan, insufficient, dimensions: { longTerm: importance.reason, urgency: until !== null && until <= 14 ? reason : 'Keine Prüfung in den nächsten 14 Tagen eingetragen.', improvement: insufficient ? 'Dein bekannter Punktestand liegt unter 5. Kläre zuerst konkrete Fehler und erreichbare Verbesserungen.' : gap > 0 ? `${format(gap)} Punkte Abstand zu deinem Fachziel.` : 'Kein bekannter Abstand zum Fachziel.' } };
  }).sort((a, b) => b.score - a.score || a.subjectId.localeCompare(b.subjectId));
}

export function getRecommendations(state, date) {
  const priorities = getSubjectPriorities(state, date);
  if (availableStudyMinutes(state, date) < 5) return [{ id: 'recovery', title: 'Heute Freiraum behalten', why: 'In deinem eingetragenen Zeitfenster ist keine realistische Lerneinheit frei.', how: 'Lass den heutigen Tag frei. Wenn sich dein Tag ändert, passe die verfügbare Zeit an; der Plan wird neu berechnet.', minutes: 0, benefit: 'Erholung und ein Plan, der zu deinem tatsächlichen Tag passt.', type: 'recovery', score: 200 }];
  const recommendations = priorities.slice(0, 3).map((item, index) => {
    const subject = state.subjects.find(entry => entry.id === item.subjectId);
    const topic = subject.weakTopics?.[0] || (item.subjectId === 'german' ? 'einen Analyseabsatz' : 'den unklarsten Inhalt der letzten Stunde');
    const language = /german|deutsch|english|englisch/i.test(subject.name);
    return { id: `subject-${item.subjectId}`, subjectId: item.subjectId, title: `${item.name}: ${language ? 'klarer schreiben' : 'gezielt üben'}`, why: item.reason,
      how: language ? `Bearbeite ${topic}. Formuliere eine Aussage, belege sie am Text und erkläre die Wirkung. Verbessere anschließend einen Satz.` : `Erkläre ${topic} ohne Unterlagen. Löse anschließend zwei passende Aufgaben aus deinem Unterricht und korrigiere jeden Fehler.`,
      minutes: item.minutes, benefit: language ? 'Ein überprüfbarer Absatz und ein konkreter Verbesserungspunkt.' : 'Zwei überprüfte Lösungen und ein Fehler, den du beim nächsten Mal vermeidest.', type: 'academic', score: item.score - index };
  });
  const unfinishedProject = (state.activities || []).find(activity => /coding|code|ai|software|project|projekt/i.test(`${activity.type} ${activity.name}`) && !activity.projectUrl && !(activity.evidence || []).some(record => record.url || record.note));
  const undocumented = unfinishedProject || (state.activities || []).find(activity => !activity.responsibilities && !activity.achievements);
  if (undocumented) recommendations.push({ id: `evidence-${undocumented.id}`, title: `${undocumented.name}: deinen Beitrag dokumentieren`, why: 'Konkrete, belegbare Verantwortung ist hilfreicher als eine lange Liste von Aktivitäten.', how: `Notiere für ${undocumented.name}, was du selbst gemacht hast. Ergänze nur tatsächlich bekannte Ergebnisse und vorhandene Belege.`, minutes: 15, benefit: 'Ein ehrlicher, später nutzbarer Eintrag für dein Bewerbungsprofil.', type: 'profile', score: 52 });
  const ielts = getIELTSCandidates(state, date)[0];
  if (ielts) recommendations.push({ id: `recommend-${ielts.key}`, subjectId: 'english', title: ielts.title, why: ielts.reason,
    how: ielts.steps.map(step => typeof step === 'string' ? step : step.instruction).join(' '), minutes: Math.min(ielts.minutes, availableStudyMinutes(state, date)), benefit: ielts.expectedResult, type: 'ielts', score: ielts.score });
  const repeatedDifficulty = priorities.find(item => {
    const grades = (state.grades || []).filter(grade => grade.subjectId === item.subjectId && grade.date <= date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    const sessions = (state.tasks || []).filter(task => task.subjectId === item.subjectId && task.completed).length;
    return grades.length === 3 && sessions >= 3 && item.target !== null && grades.every(grade => grade.points < item.target) && item.trend !== null && item.trend <= 0;
  });
  if (repeatedDifficulty) recommendations.push({ id: `feedback-${repeatedDifficulty.subjectId}`, subjectId: repeatedDifficulty.subjectId, title: 'Gezieltes Feedback holen', why: 'Mehrere Ergebnisse liegen trotz wiederholter Übung unter deinem Ziel.', how: 'Zeige deiner Lehrkraft einen konkreten Lösungsversuch und frage nach dem einen wichtigsten nächsten Verbesserungsschritt.', minutes: 10, benefit: 'Eine überprüfte Erklärung deiner wiederkehrenden Schwierigkeit.', type: 'feedback', score: repeatedDifficulty.score + 1 });
  return recommendations.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
