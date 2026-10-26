/**
 * Source-aware topic selection. The initial catalogue contains only fields supplied
 * by the user, pending access to the official 2028 sources. It is deliberately NOT
 * presented as a complete or verified official Hessen curriculum.
 */
export const CURRICULUM_SEMESTERS = ['Q1', 'Q2'];
export const TOPIC_STATUSES = ['not-started', 'class', 'understood', 'practice'];
export const TOPIC_STATUS_LABELS = { 'not-started': 'Noch nicht begonnen', class: 'Im Unterricht', understood: 'Verstanden', practice: 'Muss ich üben' };
export const CURRICULUM_SUBJECTS = [
  { id: 'mathematics', label: 'Mathematik', level: 'LK' }, { id: 'physics', label: 'Physik', level: 'LK' },
  { id: 'german', label: 'Deutsch', level: 'GK' }, { id: 'english', label: 'Englisch', level: 'GK' },
  { id: 'history', label: 'Geschichte', level: 'GK' }, { id: 'politics', label: 'Politik und Wirtschaft', level: 'GK' },
  { id: 'computer-science', label: 'Informatik', level: 'GK' }, { id: 'art', label: 'Kunst', level: 'GK' },
  { id: 'religion', label: 'Evangelische Religion', level: 'GK' }, { id: 'sport', label: 'Sport', level: 'GK' },
];
export const CURRICULUM_SOURCES = {
  kcgo: { id: 'kcgo', title: 'Hessen · Kerncurricula der gymnasialen Oberstufe', url: 'https://kultus.hessen.de/unterricht/kerncurricula-und-lehrplaene/kerncurricula/kerncurricula-fuer-die-gymnasiale-oberstufe-kcgo', verifiedAt: null, version: null, status: 'source-unverified' },
  abitur2028: { id: 'abitur2028', title: 'Hessen · Abiturerlass 2028', url: 'https://kultus.hessen.de/sites/kultus.hessen.de/files/2026-07/abiturerlass_2028.pdf', verifiedAt: null, version: '2028 · Abruf und Geltungsprüfung ausstehend', status: 'source-unverified' },
};
const clean = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const supplied = (subjectId, semester, code, title, suffix = '', parentId = '') => ({
  id: `provided-${subjectId}-${semester.toLowerCase()}-${suffix || code.replace('.', '-').toLowerCase()}`,
  subjectId, semester, code, title, parentId, level: CURRICULUM_SUBJECTS.find(item => item.id === subjectId)?.level || 'GK',
  origin: 'provided-pending-verification', requirement: 'unknown', sourceId: 'kcgo', sourceUrl: CURRICULUM_SOURCES.kcgo.url,
  curriculumVersion: null, applicableCohort: '2028', verifiedAt: null, skills: [], practice: [],
});
const fields = [
  supplied('mathematics', 'Q1', 'Q1.1', 'Einführung in die Integralrechnung'),
  supplied('mathematics', 'Q1', 'Q1.2', 'Anwendungen der Integralrechnung'),
  supplied('mathematics', 'Q1', 'Q1.3', 'Vertiefung der Differenzial- und Integralrechnung'),
  supplied('mathematics', 'Q2', 'Q2.1', 'Vertiefung der Analysis'),
  supplied('mathematics', 'Q2', 'Q2.2', 'Orientieren und Bewegen im Raum'),
  supplied('mathematics', 'Q2', 'Q2.3', 'Geraden und Ebenen im Raum'),
  supplied('physics', 'Q1', 'Q1.1', 'Elektrisches Feld'),
  supplied('physics', 'Q1', 'Q1.2', 'Magnetisches Feld'),
  supplied('physics', 'Q2', 'Q2.1', 'Mechanische Schwingungen'),
  supplied('physics', 'Q2', 'Q2.2', 'Induktion und elektromagnetische Schwingungen'),
  supplied('physics', 'Q2', 'Q2.3', 'Mechanische Wellen'),
  supplied('english', 'Q1', '', 'Politics, Culture and Society — USA', 'usa'),
  supplied('english', 'Q1', '', 'American ideals and realities', 'american-ideals', 'provided-english-q1-usa'),
  supplied('english', 'Q1', '', 'Equality, freedom, and the pursuit of happiness', 'equality', 'provided-english-q1-usa'),
  supplied('english', 'Q2', '', 'Science and Technology', 'science-technology'),
  supplied('english', 'Q2', '', 'Scientific progress', 'scientific-progress', 'provided-english-q2-science-technology'),
  supplied('english', 'Q2', '', 'Technology and society', 'technology-society', 'provided-english-q2-science-technology'),
  supplied('english', 'Q2', '', 'Utopian and dystopian futures', 'utopian-dystopian', 'provided-english-q2-science-technology'),
  // The following are supplied learning examples, not asserted official subcodes.
  supplied('physics', 'Q1', '', 'Elektrische Feldstärke', 'feldstaerke', 'provided-physics-q1-q1-1'),
  supplied('physics', 'Q1', '', 'Kondensator', 'kondensator', 'provided-physics-q1-q1-1'),
  supplied('physics', 'Q1', '', 'Laden', 'laden', 'provided-physics-q1-kondensator'),
  supplied('physics', 'Q1', '', 'Entladen', 'entladen', 'provided-physics-q1-kondensator'),
];
export const PROVIDED_CURRICULUM_TOPICS = fields.map(item => Object.freeze(item));

export function normalizeCurriculum(value = {}) {
  const input = object(value);
  const customIds = new Set();
  const customTopics = (Array.isArray(input.customTopics) ? input.customTopics : []).slice(0, 1000).flatMap(raw => {
    const item = object(raw), id = clean(item.id, 150), subjectId = clean(item.subjectId, 150), title = clean(item.title, 300);
    if (!id || !subjectId || !title || !CURRICULUM_SEMESTERS.includes(item.semester) || customIds.has(id) || fields.some(field => field.id === id)) return [];
    customIds.add(id);
    return [{ id, subjectId, semester: item.semester, title, parentId: clean(item.parentId, 150), origin: item.origin === 'personal' ? 'personal' : 'teacher', note: clean(item.note, 2000) }];
  });
  // Reject cross-subject/semester and cyclic parent references; retain each topic.
  const byId = new Map([...fields, ...customTopics].map(item => [item.id, item]));
  for (const topic of customTopics) {
    const parent = byId.get(topic.parentId);
    if (!parent || parent.subjectId !== topic.subjectId || parent.semester !== topic.semester || topic.parentId === topic.id) { topic.parentId = ''; continue; }
    const seen = new Set([topic.id]);
    let cursor = parent;
    while (cursor) {
      if (seen.has(cursor.id)) { topic.parentId = ''; break; }
      seen.add(cursor.id); cursor = byId.get(cursor.parentId);
    }
  }
  const selectionIds = new Set();
  const selections = (Array.isArray(input.selections) ? input.selections : []).slice(0, 2000).flatMap(raw => {
    const item = object(raw), topicId = clean(item.topicId, 150), topic = byId.get(topicId);
    if (!topic || selectionIds.has(topicId) || item.subjectId !== topic.subjectId || item.semester !== topic.semester) return [];
    selectionIds.add(topicId);
    return [{ id: clean(item.id, 180) || `selection-${topicId}`, subjectId: topic.subjectId, semester: topic.semester, topicId, status: TOPIC_STATUSES.includes(item.status) ? item.status : 'not-started', examRelevant: item.examRelevant === true }];
  });
  return { version: 1, selections, customTopics };
}

export function getCurriculumTopics(data, subjectId, semester = 'Q1') {
  const curriculum = normalizeCurriculum(data?.curriculum);
  const topics = [...fields, ...curriculum.customTopics.map(item => ({ ...item, code: '', requirement: 'teacher-selected', sourceId: '', sourceUrl: '', curriculumVersion: null, verifiedAt: null, skills: [], practice: [] }))].filter(item => item.subjectId === subjectId && item.semester === semester);
  const byId = new Map(topics.map(item => [item.id, item]));
  const selections = new Map(curriculum.selections.map(item => [item.topicId, item]));
  return topics.map(item => {
    const ancestors = []; let parent = byId.get(item.parentId); const seen = new Set([item.id]);
    while (parent && !seen.has(parent.id)) { seen.add(parent.id); ancestors.unshift(parent.title); parent = byId.get(parent.parentId); }
    const selection = selections.get(item.id);
    return { ...item, path: [...ancestors, item.title], learningTopic: [...ancestors, item.title].join(' · '), status: selection?.status || 'not-started', examRelevant: selection?.examRelevant || false, selectionId: selection?.id || '' };
  });
}

export function getCurrentLearningTopics(data, subjectId, semester) {
  const selectedSemester = CURRICULUM_SEMESTERS.includes(semester) ? semester : CURRICULUM_SEMESTERS.includes(data?.profile?.schoolYear) ? data.profile.schoolYear : 'Q1';
  const topics = getCurriculumTopics(data, subjectId, selectedSemester);
  const active = topics.filter(item => item.status === 'class' || item.status === 'practice' || item.examRelevant);
  const byId = new Map(topics.map(item => [item.id, item]));
  const ancestorIds = new Set();
  // A selected child is the more precise learning instruction. Preserve every
  // selection in storage/UI, but never rotate back to its broad parent instead.
  for (const topic of active) {
    const seen = new Set([topic.id]);
    let parent = byId.get(topic.parentId);
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id); ancestorIds.add(parent.id); parent = byId.get(parent.parentId);
    }
  }
  return active.filter(item => !ancestorIds.has(item.id))
    .sort((a, b) => Number(b.examRelevant) - Number(a.examRelevant) || Number(b.status === 'practice') - Number(a.status === 'practice') || b.path.length - a.path.length);
}

export function setCurriculumSelection(data, topicId, patch = {}) {
  const curriculum = normalizeCurriculum(data?.curriculum);
  const topic = [...fields, ...curriculum.customTopics].find(item => item.id === topicId);
  if (!topic) return data;
  const old = curriculum.selections.find(item => item.topicId === topicId);
  const item = { id: old?.id || `selection-${topicId}`, subjectId: topic.subjectId, semester: topic.semester, topicId, status: old?.status || 'not-started', examRelevant: old?.examRelevant || false, ...patch };
  return { ...data, curriculum: normalizeCurriculum({ ...curriculum, selections: [...curriculum.selections.filter(item => item.topicId !== topicId), { ...item, topicId, subjectId: topic.subjectId, semester: topic.semester }] }) };
}

export function saveCustomTopic(data, value) {
  const curriculum = normalizeCurriculum(data?.curriculum);
  const item = object(value);
  const id = clean(item.id, 150) || `custom-topic-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const old = curriculum.customTopics.find(topic => topic.id === id);
  const next = normalizeCurriculum({ ...curriculum, customTopics: [...curriculum.customTopics.filter(topic => topic.id !== id), { ...old, ...item, id }] });
  if (!next.customTopics.some(topic => topic.id === id)) throw new TypeError('Bitte Fach, Halbjahr und Thema ergänzen.');
  return { ...data, curriculum: next };
}

export function removeCustomTopic(data, topicId) {
  const curriculum = normalizeCurriculum(data?.curriculum);
  if (!curriculum.customTopics.some(item => item.id === topicId)) return data;
  return { ...data, curriculum: normalizeCurriculum({ ...curriculum, selections: curriculum.selections.filter(item => item.topicId !== topicId), customTopics: curriculum.customTopics.filter(item => item.id !== topicId).map(item => item.parentId === topicId ? { ...item, parentId: '' } : item) }) };
}
