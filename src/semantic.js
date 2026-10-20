/** One restrained visual vocabulary; labels and icons remain the primary cues. */
export function semanticCategory(record = {}) {
  const type = String(record.type || record.category || '').toLowerCase();
  const title = `${record.title || record.name || ''}`.toLowerCase();
  if (record.ieltsSkill || record.satSkill || record.source === 'ielts' || record.source === 'sat' || /\bielts\b|\bsat\b/.test(title)) return 'test';
  if (record.examId || type === 'exam') return 'exam';
  if (/work|entrepreneur|marketing|internship/.test(type) || /restaurant/.test(title)) return 'work';
  if (/project/.test(type) || /coding|github|programmier/.test(title)) return 'project';
  if (/sport|personal/.test(type) || /volleyball/.test(title)) return 'personal';
  if (/application|university/.test(type)) return 'university';
  return 'school';
}
