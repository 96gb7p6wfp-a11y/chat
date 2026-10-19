/** Short, human explanations for cards; full planning context stays in details. */
export function shortTaskReason(task, data) {
  const exam = data.exams?.find(item => item.id === task.examId);
  if (exam) {
    const days = Math.round((Date.parse(`${exam.date}T12:00:00Z`) - Date.parse(`${task.date}T12:00:00Z`)) / 86400000);
    return days === 0 ? 'Prüfung heute' : days === 1 ? 'Prüfung morgen' : days > 0 ? `Prüfung in ${days} Tagen` : 'Auf deiner Vorbereitung aufbauen';
  }
  const subject = data.subjects?.find(item => item.id === task.subjectId);
  if (subject && typeof subject.target === 'number') {
    const grades = [['Schriftlich', subject.written], ['Mündlich', subject.oral]].filter(([, value]) => typeof value === 'number').sort((a, b) => a[1] - b[1]);
    if (grades[0]?.[1] < subject.target) return `${grades[0][0]} ${grades[0][1]} · Ziel ${subject.target} Punkte`;
  }
  if (task.eventId) {
    const match = task.reason?.match(/(?:deadline is|starts|is) (today|in \d+ days)/);
    if (match) return `${task.eventId.startsWith('university:') ? 'Frist' : 'Nächster Meilenstein'} ${match[1]}`;
  }
  if (task.category === 'review') return 'Den Schwerpunkt für die nächste Woche wählen';
  if (task.category === 'activity') return 'Dein Bewerbungsprofil stärken';
  if (task.category === 'university') return 'Deinen nächsten Bewerbungsschritt vorbereiten';
  if (task.category === 'language') return 'Klarer und genauer schreiben';
  return 'Deine schulischen Leistungen stärken';
}

export function todayFocus(task, data) {
  if (!task) return 'Zeit zum Durchatmen';
  const exam = data.exams?.find(item => item.id === task.examId);
  if (exam) return `${exam.title} vorbereiten`;
  const subject = data.subjects?.find(item => item.id === task.subjectId);
  if (subject) return subject.name === 'Mathematics' ? 'Mathematik: schriftlich sicherer werden' : `${subject.name}: gezielt verbessern`;
  return ({ activity: 'Dein Bewerbungsprofil', university: 'Studienvorbereitung', review: 'Dein Wochenrückblick', language: 'Stärkere Sprachkenntnisse' })[task.category] || task.title;
}
