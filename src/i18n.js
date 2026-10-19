const SUBJECT_LABELS = {
  Mathematics: 'Mathematik', Physics: 'Physik', English: 'Englisch', German: 'Deutsch',
  History: 'Geschichte', 'Politics / Economics': 'Politik / Wirtschaft',
  'Computer Science': 'Informatik', Art: 'Kunst', Religion: 'Religion', Sport: 'Sport',
};

/** Translate known product vocabulary, never personal notes or custom names. */
export function subjectLabel(subject) {
  const name = typeof subject === 'string' ? subject : subject?.name;
  return SUBJECT_LABELS[name] || name || 'Lernen';
}
export const categoryLabel = category => ({ academics: 'Schule', language: 'Sprache', university: 'Universität', activity: 'Bewerbungsprofil', review: 'Wochenrückblick' })[category] || 'Lernen';
export const pointLabel = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : 'Offen';
