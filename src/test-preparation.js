// Explainable workload guidance. These are planning limits, never score predictions.
export const TEST_SOURCES = { official: 'Offizielles Ergebnis', mock: 'Probeprüfung', self: 'Selbsteinschätzung' };
export const validPreparationDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export const preparationDay = value => validPreparationDate(value) ? Math.floor(Date.parse(`${value}T12:00:00Z`) / 86400000) : null;
export const preparationShift = (date, count) => new Date((preparationDay(date) + count) * 86400000).toISOString().slice(0, 10);

export function getPreparationContext(state, today, test, requestedMinutes) {
  const todayNumber = preparationDay(today);
  const day = validPreparationDate(today) ? new Date(`${today}T12:00:00Z`).getUTCDay() : 0;
  const weekStart = todayNumber === null ? null : todayNumber - (day + 6) % 7;
  const weekly = Array.isArray(state?.schedule?.weekly) ? state.schedule.weekly : [];
  const weeklyAvailable = weekly.length ? weekly.reduce((sum, item) => sum + Math.max(0, Number(item.minutes) || 0), 0) : null;
  const otherName = test === 'sat' ? 'ielts' : 'sat';
  const other = state?.[otherName];
  const otherConfigured = otherName === 'ielts' ? !!(other?.examDate || other?.targetOverall != null || other?.scores?.length) : !!(other?.examDate || other?.targetTotal != null || other?.scores?.length);
  const otherRequested = other?.enabled !== false && otherConfigured ? Math.max(0, Number(other.weeklyMinutes) || 0) : 0;
  const combined = Math.max(0, Number(requestedMinutes) || 0) + otherRequested;
  const allowance = weeklyAvailable !== null && combined > weeklyAvailable ? Math.floor(Math.max(0, requestedMinutes) * weeklyAvailable / combined) : Math.max(0, requestedMinutes);
  const completed = (Array.isArray(state?.tasks) ? state.tasks : []).filter(task => task.completed && (test === 'sat' ? !!task.satSkill : !!task.ieltsSkill) && validPreparationDate(task.date) && task.date <= today);
  const used = completed.filter(task => weekStart !== null && preparationDay(task.date) >= weekStart).reduce((sum, task) => sum + Math.max(0, Number(task.minutes) || 0), 0);
  const nextExam = (Array.isArray(state?.exams) ? state.exams : []).filter(exam => validPreparationDate(exam.date) && exam.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  const daysToSchoolExam = nextExam && todayNumber !== null ? preparationDay(nextExam.date) - todayNumber : null;
  const schoolCap = daysToSchoolExam !== null && daysToSchoolExam <= 2 ? 15 : daysToSchoolExam !== null && daysToSchoolExam <= 7 ? 25 : 60;
  const reason = schoolCap < 60 ? `Deine nächste Schulklausur ist ${daysToSchoolExam === 0 ? 'heute' : `in ${daysToSchoolExam} Tagen`}. Testvorbereitung bleibt deshalb kurz.` : 'Schule, Sprachtests und Profil teilen sich deine verfügbare Lernzeit.';
  return { allowance, used, remaining: Math.max(0, allowance - used), schoolCap, nextExam, daysToSchoolExam, completed, reason, weeklyAvailable };
}

export function getPreparationHorizon(state, today, { measuredCount = 0, gap = null, test = 'IELTS' } = {}) {
  if (!validPreparationDate(today)) return { headline: 'Zuerst deinen Stand klären', explanation: 'Erfasse ein tatsächliches Datum und ein ausgewertetes Ergebnis.', window: null };
  const weeks = !measuredCount ? 8 : gap === null || gap <= 0 ? 6 : gap <= (test === 'SAT' ? 100 : .5) ? 8 : 12;
  const earliest = preparationShift(today, weeks * 7);
  // A proposed period is kept away from entered school exams, not presented as a bookable test date.
  const nearby = (state?.exams || []).filter(exam => validPreparationDate(exam.date) && Math.abs(preparationDay(exam.date) - preparationDay(earliest)) <= 7).sort((a, b) => b.date.localeCompare(a.date));
  const start = nearby.length ? preparationShift(nearby[0].date, 14) : earliest;
  return {
    headline: !measuredCount ? 'Erst Diagnose, dann Prüfungstermin' : `Mit einem ${weeks}-Wochen-Plan beginnen`,
    explanation: !measuredCount ? 'Ohne ausgewertete Probeprüfung lässt sich deine benötigte Vorbereitungszeit nicht seriös bestimmen. Nutze zunächst eine Diagnose und überprüfe den Plan nach zwei Wochen.' : 'Dieses Zeitfenster ist ein überprüfbarer Planungsvorschlag, keine Prognose für einen bestimmten Score. Vergleiche nach zwei Wochen neue Ergebnisse und passe Umfang oder Termin an.',
    window: { start, end: preparationShift(start, 14) },
    note: nearby.length ? 'Das vorgeschlagene Fenster hält Abstand zu einer eingetragenen Schulklausur. Es sind keine bestätigten Anbietertermine.' : 'Plane Puffer für Schule und einen möglichen zweiten Versuch. Anbietertermine und Testplätze sind noch zu prüfen.',
  };
}

/** Dated preparation proposals, not bookings or extra tasks outside the shared daily plan. */
export function getPreparationMilestones(state, today, examDate, { measured = false, test = 'IELTS' } = {}) {
  if (!validPreparationDate(today) || !validPreparationDate(examDate) || examDate < today) return [];
  const remaining = preparationDay(examDate) - preparationDay(today);
  if (remaining <= 1) return [{ date: today, title: 'Bekannte Fehler ruhig wiederholen', detail: 'Unterlagen prüfen, nichts Großes neu beginnen und Erholung bewahren.' }];
  const proposed = [
    { date: today, title: measured ? 'Wichtigstes Fehlermuster bearbeiten' : 'Standortbestimmung beginnen', detail: measured ? 'Nutze dein letztes ausgewertetes Ergebnis; übe zuerst die schwächere Fähigkeit.' : 'Teste die Bereiche mit offiziellen Aufgaben. Ein vollständiger Test braucht einen ausreichend großen freien Block.' },
    ...(remaining > 14 ? [{ date: preparationShift(today, Math.min(14, remaining - 14)), title: 'Zwischenstand prüfen', detail: 'Vergleiche neue Ergebnisse mit dem Ausgangswert und passe Lernzeit oder Termin an.' }] : []),
    { date: preparationShift(examDate, remaining >= 21 ? -14 : -Math.max(2, Math.floor(remaining / 2))), title: test === 'SAT' ? 'Bluebook-Probetest einplanen' : 'Zeitgebundene Probeprüfung planen', detail: test === 'SAT' ? 'Nur bei 144 Minuten freier Zeit einschließlich Pause; die Fehleranalyse folgt separat.' : 'Bereiche unter realistischen Zeiten bearbeiten. Bei wenig freier Zeit auf mehrere Tage aufteilen und keine vollständige Simulation behaupten.' },
    { date: preparationShift(examDate, -1), title: 'Leichte Wiederholung & Unterlagen', detail: 'Nur bekannte Fehler prüfen, Ausweis und Anreise klären und rechtzeitig aufhören.' },
  ];
  const seen = new Set();
  return proposed.map(item => {
    if (item.date === today || item.date === preparationShift(examDate, -1)) return item;
    let date = item.date;
    // Move suggested practice earlier around actual school examinations, never change the test date.
    for (let i = 0; i < 7 && date > today && (state?.exams || []).some(exam => validPreparationDate(exam.date) && Math.abs(preparationDay(exam.date) - preparationDay(date)) <= 2); i++) date = preparationShift(date, -1);
    return { ...item, date, detail: `${item.detail}${date !== item.date ? ' Wegen einer Schulklausur nach vorn verschoben.' : ''}` };
  }).filter(item => item.date >= today && item.date < examDate && !seen.has(`${item.date}:${item.title}`) && seen.add(`${item.date}:${item.title}`)).sort((a, b) => a.date.localeCompare(b.date));
}
