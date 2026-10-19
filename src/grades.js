/** Transparent course estimates. No official Hessen/Abitur weighting is inferred. */
export const GRADE_TYPES = ['written', 'oral', 'participation', 'presentation', 'other'];
export const SEMESTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
export const GRADE_LABELS = { written: 'Klausur / schriftlich', oral: 'Mündlich', participation: 'Sonstige Mitarbeit', presentation: 'Präsentation', other: 'Weitere Leistung' };
const numeric = value => value !== '' && value !== null && value !== undefined && typeof value !== 'boolean' && Number.isFinite(Number(value)) ? Number(value) : null;
const pointValue = value => { const number = numeric(value); return number !== null && number >= 0 && number <= 15 ? number : null; };
const positive = value => { const number = numeric(value); return number !== null && number > 0 && number <= 100000 ? number : null; };
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export function normalizeGrading(value = {}) {
  const config = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return { mode: ['simple', 'weighted', 'category'].includes(config.mode) ? config.mode : 'simple', weights: Object.fromEntries(GRADE_TYPES.map(type => [type, positive(config.weights?.[type])])), courseWeight: positive(config.courseWeight) || 1 };
}
export function normalizeAcademicGrade(value) {
  if (!value || typeof value !== 'object' || !String(value.id || '').trim() || !String(value.subjectId || '').trim() || !validDate(value.date) || pointValue(value.points) === null) return null;
  return { id: String(value.id).slice(0, 150), subjectId: String(value.subjectId).slice(0, 150), points: pointValue(value.points), type: GRADE_TYPES.includes(value.type) ? value.type : 'written', date: value.date, semester: SEMESTERS.includes(value.semester) ? value.semester : '', weight: positive(value.weight), note: typeof value.note === 'string' ? value.note.slice(0, 3000) : '' };
}
export function calculateGradeAverage(records = [], settings = {}) {
  const grading = normalizeGrading(settings);
  const valid = records.filter(record => pointValue(record.points) !== null);
  const categories = Object.fromEntries(GRADE_TYPES.map(type => [type, mean(valid.filter(record => record.type === type).map(record => Number(record.points)))]));
  if (!valid.length) return { average: null, complete: false, missingCategories: [], missingWeights: [], categories, reason: 'Noch keine Einzelleistungen erfasst.' };
  if (grading.mode === 'simple') return { average: mean(valid.map(record => Number(record.points))), complete: true, missingCategories: [], missingWeights: [], categories, reason: 'Alle erfassten Leistungen zählen gleich.' };
  if (grading.mode === 'weighted') {
    const missingWeights = valid.filter(record => positive(record.weight) === null).map(record => record.id);
    if (missingWeights.length) return { average: null, complete: false, missingWeights, missingCategories: [], categories, reason: 'Für jede Leistung wird eine Gewichtung benötigt.' };
    const weight = valid.reduce((sum, record) => sum + Number(record.weight), 0);
    return { average: valid.reduce((sum, record) => sum + Number(record.points) * Number(record.weight), 0) / weight, complete: true, missingWeights: [], missingCategories: [], categories, reason: 'Berechnet mit deinen Gewichten je Einzelleistung.' };
  }
  const included = GRADE_TYPES.filter(type => grading.weights[type] !== null);
  const missingCategories = included.filter(type => categories[type] === null);
  const unconfigured = valid.some(record => grading.weights[record.type] === null);
  if (!included.length || missingCategories.length || unconfigured) return { average: null, complete: false, missingCategories, missingWeights: [], categories, reason: !included.length ? 'Lege die Gewichtung der Leistungsarten fest.' : unconfigured ? 'Für mindestens eine erfasste Leistungsart fehlt die Gewichtung.' : 'Für eine gewichtete Leistungsart fehlt noch ein Ergebnis.' };
  const totalWeight = included.reduce((sum, type) => sum + grading.weights[type], 0);
  return { average: included.reduce((sum, type) => sum + categories[type] * grading.weights[type], 0) / totalWeight, complete: true, missingCategories: [], missingWeights: [], categories, reason: 'Die Mittelwerte der Leistungsarten zählen nach deinen Gewichten. Innerhalb einer Art zählt jede Leistung gleich.' };
}
function evidenceTrend(records, grading) {
  const sorted = records.filter(record => validDate(record.date)).toSorted((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 4) return { direction: 'unknown', difference: null, reason: 'Für einen belastbareren Vergleich werden mindestens vier Einzelleistungen benötigt.' };
  const split = Math.floor(sorted.length / 2);
  const before = calculateGradeAverage(sorted.slice(0, split), grading).average;
  const after = calculateGradeAverage(sorted.slice(split), grading).average;
  if (before === null || after === null) return { direction: 'unknown', difference: null, reason: 'Die Vergleichszeiträume sind noch nicht vollständig gewichtet.' };
  const difference = after - before;
  return { direction: Math.abs(difference) < 0.5 ? 'steady' : difference > 0 ? 'up' : 'down', difference, before, after, reason: 'Vergleich der älteren mit der neueren Hälfte deiner erfassten Ergebnisse; kein prognostizierter Abiturschnitt.' };
}
export function calculateSubject(data, subjectId, semester) {
  const subject = (data.subjects || []).find(entry => entry.id === subjectId);
  if (!subject) return { average: null, target: null, gap: null, source: 'unknown', records: [], trend: { direction: 'unknown', difference: null }, complete: false, semesterAverages: [] };
  const grading = normalizeGrading(subject.grading);
  const allRecords = (data.grades || []).filter(record => record.subjectId === subjectId && pointValue(record.points) !== null);
  const hasAssignedSemester = allRecords.some(record => SEMESTERS.includes(record.semester));
  const currentSemester = SEMESTERS.includes(data.profile?.schoolYear) ? data.profile.schoolYear : null;
  const selectedSemester = semester === 'all' ? null : SEMESTERS.includes(semester) ? semester : hasAssignedSemester ? currentSemester : null;
  const records = selectedSemester ? allRecords.filter(record => record.semester === selectedSemester) : hasAssignedSemester && semester !== 'all' && !currentSemester ? [] : allRecords;
  const result = calculateGradeAverage(records, grading);
  let average = result.average;
  let source = records.length ? 'assessments' : 'unknown';
  // Baselines are not extra assessments and are never mixed into real results.
  if (!allRecords.length && !selectedSemester && semester !== 'all' && grading.mode === 'simple') {
    const values = [Object.hasOwn(subject, 'baselineWritten') ? subject.baselineWritten : subject.written, Object.hasOwn(subject, 'baselineOral') ? subject.baselineOral : subject.oral].map(pointValue).filter(value => value !== null);
    if (values.length) { average = mean(values); source = 'baseline'; }
  }
  const target = pointValue(subject.target);
  return { ...result, subject, subjectId, records, semester: selectedSemester, periodLabel: selectedSemester || (semester === 'all' ? 'Alle Halbjahre' : records.length ? 'Ohne Halbjahr · Orientierung' : 'Halbjahr offen'), grading, mode: grading.mode, average, target, gap: average !== null && target !== null ? target - average : null, source, complete: source === 'baseline' ? false : result.complete, methodLabel: source === 'baseline' ? 'Undatierte Ausgangswerte · grobe Orientierung' : !selectedSemester && semester !== 'all' && records.length ? 'Ohne Halbjahr · Orientierung' : grading.mode === 'simple' ? 'Einfacher Mittelwert' : grading.mode === 'weighted' ? 'Nach Einzelleistungen gewichtet' : 'Nach Leistungsarten gewichtet', trend: evidenceTrend(records, grading), semesterAverages: SEMESTERS.map(key => { const subset = allRecords.filter(record => record.semester === key); return { semester: key, count: subset.length, ...calculateGradeAverage(subset, grading) }; }), unassignedCount: allRecords.filter(record => !record.semester).length };
}
export function getAcademicOverview(data) {
  const subjects = (data.subjects || []).filter(subject => subject.enabled !== false).map(subject => calculateSubject(data, subject.id));
  const known = subjects.filter(subject => subject.average !== null);
  const weight = known.reduce((sum, subject) => sum + subject.grading.courseWeight, 0);
  const average = weight ? known.reduce((sum, subject) => sum + subject.average * subject.grading.courseWeight, 0) / weight : null;
  const target = pointValue(data.profile?.targetAverage);
  const trends = subjects.filter(subject => subject.trend.difference !== null);
  const trendDifference = trends.length ? mean(trends.map(subject => subject.trend.difference)) : null;
  return { average, target, gap: average !== null && target !== null ? target - average : null, subjects, subjectCount: known.length, totalSubjects: subjects.length, weighted: known.some(subject => subject.grading.courseWeight !== 1), includesBaselines: known.some(subject => subject.source === 'baseline'), trend: { difference: trendDifference, direction: trendDifference === null ? 'unknown' : Math.abs(trendDifference) < 0.5 ? 'steady' : trendDifference > 0 ? 'up' : 'down' }, label: 'Geschätzter Kursschnitt', disclaimer: 'Keine offizielle Abiturnote. Nur bekannte Kurswerte; unvollständige Gewichtungen und fehlende Fächer bleiben offen.' };
}
/** All unknown future results share x; explicitly scored future results are fixed what-if assumptions. */
export function requiredFutureGrades({ records = [], target, future = [], grading: settings = {} } = {}) {
  const grading = normalizeGrading(settings);
  const desired = pointValue(target);
  const known = records.filter(record => pointValue(record.points) !== null);
  const planned = Array.isArray(future) ? future : [];
  const missing = reason => ({ status: 'missing-data', achievable: null, requiredScore: null, minimumWholePoints: null, explanation: reason, assumptions: [] });
  if (desired === null) return missing('Lege zuerst ein Ziel zwischen 0 und 15 Punkten fest.');
  if (!planned.length) return missing('Trage die verbleibenden Leistungen und ihre Gewichte als Szenario ein.');
  if (planned.some(record => !GRADE_TYPES.includes(record.type))) return missing('Wähle für jede geplante Leistung eine Leistungsart.');
  if (planned.some(record => record.points !== undefined && record.points !== null && record.points !== '' && pointValue(record.points) === null)) return missing('Ein angenommenes Ergebnis muss zwischen 0 und 15 Punkten liegen.');
  let constant = 0, coefficient = 0, denominator = 0;
  const all = [...known, ...planned.map(record => ({ ...record, future: true }))];
  if (grading.mode === 'category') {
    const types = GRADE_TYPES.filter(type => grading.weights[type] !== null);
    if (!types.length || all.some(record => grading.weights[record.type] === null)) return missing('Lege zuerst die Gewichte aller verwendeten Leistungsarten fest.');
    for (const type of types) {
      const group = all.filter(record => record.type === type);
      if (!group.length) return missing(`Für „${GRADE_LABELS[type]}“ fehlt ein Ergebnis oder eine geplante Leistung.`);
      const categoryWeight = grading.weights[type];
      denominator += categoryWeight;
      for (const record of group) {
        const points = pointValue(record.points);
        if (record.future && points === null) coefficient += categoryWeight / group.length;
        else constant += Number(record.points) * categoryWeight / group.length;
      }
    }
  } else {
    if (grading.mode === 'weighted' && all.some(record => positive(record.weight) === null)) return missing('Für dieses Szenario fehlt mindestens ein Einzelgewicht.');
    for (const record of all) {
      const weight = grading.mode === 'weighted' ? Number(record.weight) : 1;
      denominator += weight;
      const points = pointValue(record.points);
      if (record.future && points === null) coefficient += weight;
      else constant += Number(record.points) * weight;
    }
  }
  const assumptions = [`${known.length} erfasste und ${planned.length} angenommene zukünftige Leistung${planned.length === 1 ? '' : 'en'}.`, grading.mode === 'simple' ? 'Alle Leistungen zählen gleich.' : grading.mode === 'weighted' ? 'Die eingegebenen Einzelgewichte gelten.' : 'Deine Gewichte der Leistungsarten gelten; innerhalb einer Art zählen Leistungen gleich.', 'Unbekannte zukünftige Ergebnisse werden mit demselben Punktwert angesetzt.'];
  const minPossible = constant / denominator;
  const maxPossible = (constant + coefficient * 15) / denominator;
  if (!coefficient) return { status: minPossible + 1e-9 >= desired ? 'already-met' : 'impossible', achievable: minPossible + 1e-9 >= desired, requiredScore: null, minimumWholePoints: null, minPossible, maxPossible, assumptions, explanation: `Alle angenommenen Ergebnisse stehen fest: Das Szenario ergibt ${minPossible.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Punkte.` };
  const requiredScore = Math.max(0, (desired * denominator - constant) / coefficient);
  const achievable = requiredScore <= 15 + 1e-9;
  const minimumWholePoints = Math.ceil(requiredScore - 1e-9);
  return { status: achievable ? 'achievable' : 'impossible', achievable, requiredScore, minimumWholePoints, minPossible, maxPossible, assumptions, explanation: achievable ? `Du brauchst in den offenen Leistungen im Mittel mindestens ${requiredScore.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Punkte. Mit jeweils ${minimumWholePoints} ganzen Punkten erreichst du das Ziel in diesem Szenario.` : `In diesem Szenario wären im Mittel ${requiredScore.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Punkte nötig. Mehr als 15 sind nicht möglich; selbst mit 15 erreichst du höchstens ${maxPossible.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Punkte.` };
}
