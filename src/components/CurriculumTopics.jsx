import React, { useState } from 'react';
import { BookOpen, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Field } from './UI.jsx';
import { subjectLabel } from '../i18n.js';
import { CURRICULUM_SEMESTERS, CURRICULUM_SOURCES, CURRICULUM_SUBJECTS, TOPIC_STATUS_LABELS, TOPIC_STATUSES, getCurriculumTopics, getCurrentLearningTopics, normalizeCurriculum, removeCustomTopic, saveCustomTopic, setCurriculumSelection } from '../curriculum.js';
import './curriculum-topics.css';

/** A compact, editable topic picker; pending official research is explicit. */
export default function CurriculumTopics({ data, onChange, subjectId: fixedSubjectId, semester: fixedSemester, onPractice }) {
  const [selectedSubject, setSelectedSubject] = useState(fixedSubjectId || 'mathematics');
  const [selectedSemester, setSelectedSemester] = useState(CURRICULUM_SEMESTERS.includes(fixedSemester) ? fixedSemester : CURRICULUM_SEMESTERS.includes(data.profile?.schoolYear) ? data.profile.schoolYear : 'Q1');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const subjectId = fixedSubjectId || selectedSubject;
  const semester = CURRICULUM_SEMESTERS.includes(fixedSemester) ? fixedSemester : selectedSemester;
  const topics = getCurriculumTopics(data, subjectId, semester);
  const active = getCurrentLearningTopics(data, subjectId, semester);
  const curriculum = normalizeCurriculum(data.curriculum);
  const subject = data.subjects?.find(item => item.id === subjectId) || CURRICULUM_SUBJECTS.find(item => item.id === subjectId);
  const label = subject?.name ? subjectLabel(subject) : subject?.label || 'Fach';
  const setSelection = (id, patch) => onChange(current => setCurriculumSelection(current, id, patch));
  const beginNew = () => { setError(''); setEditing({ id: '', title: '', parentId: '', origin: 'teacher', note: '' }); };
  const submit = event => {
    event.preventDefault();
    if (!editing?.title?.trim()) { setError('Bitte gib ein Thema ein.'); return; }
    const record = { ...editing, subjectId, semester };
    // Allocate once outside the updater, which React may invoke repeatedly.
    if (!record.id) record.id = `custom-topic-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    onChange(current => {
      const changed = saveCustomTopic(current, record);
      return editing.id ? changed : setCurriculumSelection(changed, record.id, { status: 'class' });
    });
    setEditing(null); setError('');
  };
  const changeScope = callback => { setEditing(null); setError(''); callback(); };
  return <section className="curriculum-topics" aria-label="Q1 und Q2 Unterrichtsthemen">
    <header className="curriculum-heading"><div><span className="page-kicker">DEIN UNTERRICHT</span><h2>Aktuelle Themen</h2></div><span className="curriculum-active-count">{active.length} aktiv</span></header>
    <div className="curriculum-scope">
      {!fixedSubjectId && <Field label="Fach"><select value={subjectId} onChange={event => changeScope(() => setSelectedSubject(event.target.value))}>{CURRICULUM_SUBJECTS.map(item => { const saved = data.subjects?.find(subject => subject.id === item.id); return <option value={item.id} key={item.id}>{saved ? subjectLabel(saved) : item.label} · {saved?.level || item.level}</option>; })}{data.subjects?.filter(item => !CURRICULUM_SUBJECTS.some(known => known.id === item.id)).map(item => <option value={item.id} key={item.id}>{subjectLabel(item)} · {item.level}</option>)}</select></Field>}
      {!CURRICULUM_SEMESTERS.includes(fixedSemester) && <Field label="Halbjahr"><select value={semester} onChange={event => changeScope(() => setSelectedSemester(event.target.value))}>{CURRICULUM_SEMESTERS.map(value => <option value={value} key={value}>{value}</option>)}</select></Field>}
    </div>
    <p className="curriculum-hint">Markiere, was ihr behandelt. Aktive Themen fließen in deine Lernaufgaben ein.</p>
    {!topics.some(item => item.origin === 'provided-pending-verification') && <div className="curriculum-empty"><BookOpen size={20}/><div><strong>Deine Unterrichtsthemen ergänzen</strong><p>Der amtliche {semester}-Katalog für {label} ist noch nicht geprüft. Trage das Thema deiner Lehrkraft ein.</p></div></div>}
    <div className="curriculum-topic-list">{topics.map(topic => <details key={topic.id} className={`curriculum-topic ${topic.path.length > 1 ? 'curriculum-subtopic' : ''}`}>
      <summary><span className="curriculum-topic-name">{topic.code && <span className="curriculum-code">{topic.code}</span>}<strong>{topic.title}</strong>{topic.path.length > 1 && <span className="curriculum-parent">{topic.path.slice(0, -1).join(' › ')}</span>}</span><span className={`curriculum-state curriculum-state-${topic.status}`}>{topic.examRelevant ? 'Klausurrelevant' : TOPIC_STATUS_LABELS[topic.status]}</span><ChevronRight size={15} className="curriculum-chevron"/></summary>
      <div className="curriculum-topic-body">
        <Field label={`Lernstand · ${topic.title}`}><select value={topic.status} onChange={event => setSelection(topic.id, { status: event.target.value })}>{TOPIC_STATUSES.map(value => <option value={value} key={value}>{TOPIC_STATUS_LABELS[value]}</option>)}</select></Field>
        <label className="curriculum-checkbox"><input type="checkbox" checked={topic.examRelevant} onChange={event => setSelection(topic.id, { examRelevant: event.target.checked })}/><span>Klausurrelevant</span></label>
        <p className="curriculum-provenance">{topic.origin === 'provided-pending-verification' ? 'Von dir vorgegeben · amtlicher Abgleich offen. Pflichtstatus und Lehrplanversion noch nicht bestätigt.' : topic.origin === 'personal' ? 'Eigenes Lernthema · keine amtliche Vorgabe.' : 'Von dir eingetragenes Unterrichtsthema · keine bestätigte amtliche Vorgabe.'}</p>
        {topic.note && <p className="curriculum-note">{topic.note}</p>}
        <div className="curriculum-topic-actions">{onPractice && <Button variant="secondary" onClick={() => onPractice(topic)}>Dieses Thema üben</Button>}{curriculum.customTopics.some(item => item.id === topic.id) && <><button type="button" className="icon-button" aria-label={`Thema bearbeiten: ${topic.title}`} onClick={() => { setError(''); setEditing({ ...topic }); }}><Pencil size={16}/></button><button type="button" className="icon-button" aria-label={`Eigenes Thema löschen: ${topic.title}`} onClick={() => onChange(current => removeCustomTopic(current, topic.id))}><Trash2 size={16}/></button></>}</div>
      </div>
    </details>)}</div>
    {editing ? <form className="curriculum-custom-form" onSubmit={submit}>
      <h3>{editing.id ? 'Thema bearbeiten' : 'Thema ergänzen'}</h3>
      <Field label="Thema" error={error}><input value={editing.title} maxLength={300} onChange={event => setEditing(value => ({ ...value, title: event.target.value }))} placeholder="z. B. RC-Kreis: Kondensator entladen" required/></Field>
      <Field label="Übergeordnetes Thema"><select value={editing.parentId} onChange={event => setEditing(value => ({ ...value, parentId: event.target.value }))}><option value="">Eigenständiges Thema</option>{topics.filter(item => item.id !== editing.id && !item.path.includes(editing.title)).map(item => <option value={item.id} key={item.id}>{item.path.join(' › ')}</option>)}</select></Field>
      <Field label="Herkunft"><select value={editing.origin} onChange={event => setEditing(value => ({ ...value, origin: event.target.value }))}><option value="teacher">Im Unterricht / von der Lehrkraft</option><option value="personal">Eigenes Lernthema</option></select></Field>
      <Field label="Notiz (optional)"><textarea rows={2} maxLength={2000} value={editing.note} onChange={event => setEditing(value => ({ ...value, note: event.target.value }))}/></Field>
      <div className="curriculum-form-actions"><Button variant="secondary" onClick={() => { setEditing(null); setError(''); }}>Abbrechen</Button><Button type="submit">Thema speichern</Button></div>
    </form> : <Button variant="secondary" onClick={beginNew}><Plus size={16}/>Thema ergänzen</Button>}
    <details className="product-details curriculum-source-details"><summary>Quellen & Verlässlichkeit</summary><p>Der vollständige amtliche Q1/Q2-Lehrplan und die Prüfungsschwerpunkte für Abitur 2028 sind noch nicht verifiziert. Angezeigte vorgegebene Felder stammen aus deinen Angaben. Eine Quellenadresse allein bestätigt weder Pflichtstatus noch Gültigkeit.</p><ul>{Object.values(CURRICULUM_SOURCES).map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>Prüfung ausstehend · kein bestätigter Versionsstand</span></li>)}</ul></details>
  </section>;
}
