/** Short, human explanations for cards; full planning context stays in details. */
export function shortTaskReason(task, data) {
  const exam = data.exams?.find(item => item.id === task.examId);
  if (exam) {
    const days = Math.round((Date.parse(`${exam.date}T12:00:00Z`) - Date.parse(`${task.date}T12:00:00Z`)) / 86400000);
    return days === 0 ? 'Exam today' : days === 1 ? 'Exam tomorrow' : days > 0 ? `Exam in ${days} days` : 'Build on your exam preparation';
  }
  const subject = data.subjects?.find(item => item.id === task.subjectId);
  if (subject && typeof subject.target === 'number') {
    const grades = [['Written', subject.written], ['Oral', subject.oral]].filter(([, value]) => typeof value === 'number').sort((a, b) => a[1] - b[1]);
    if (grades[0]?.[1] < subject.target) return `${grades[0][0]} ${grades[0][1]} · target ${subject.target} points`;
  }
  if (task.eventId) {
    const match = task.reason?.match(/(?:deadline is|starts|is) (today|in \d+ days)/);
    if (match) return `${task.eventId.startsWith('university:') ? 'Deadline' : 'Upcoming milestone'} ${match[1]}`;
  }
  if (task.category === 'review') return 'Set a realistic focus for next week';
  if (task.category === 'activity') return 'Build your application profile';
  if (task.category === 'university') return 'Prepare your next university step';
  if (task.category === 'language') return `Improve ${subject?.name || 'academic'} writing`;
  return 'Strengthen your school results';
}

export function todayFocus(task, data) {
  if (!task) return 'A little room to breathe';
  const exam = data.exams?.find(item => item.id === task.examId);
  if (exam) return `${exam.title} preparation`;
  const subject = data.subjects?.find(item => item.id === task.subjectId);
  if (subject) return subject.name === 'Mathematics' ? 'Mathematics written performance' : `${subject.name} improvement`;
  return ({ activity: 'Your application profile', university: 'University preparation', review: 'Your weekly reset', language: 'Stronger language skills' })[task.category] || task.title;
}
