import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Check, RotateCcw, Trash2 } from 'lucide-react';
import { getGuidedSession, normalizeLearning, removeLearningAttempt, saveLearningAttempt } from '../guided-learning.js';
import { Button, Field } from './UI.jsx';
import '../guided-learning.css';

const RATINGS = [{ value: 'again', label: 'Noch unsicher' }, { value: 'hard', label: 'Mit Mühe' }, { value: 'good', label: 'Selbstständig' }];
const dateLabel = date => date ? new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`)) : '';

/** A deliberately small practice surface: one answer, one mistake, one review. */
export default function GuidedLearning({ data, task, today, onChange, draft, onDraftChange, showObjective = true }) {
  const session = getGuidedSession(data, task, today);
  const existing = normalizeLearning(data.learning).attempts.find(entry => entry.taskId === task.id);
  const [answer, setAnswer] = useState(draft ?? task.notes ?? existing?.answer ?? '');
  const [mistake, setMistake] = useState(existing?.mistake || '');
  const [rating, setRating] = useState(existing?.rating || '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setAnswer(draft ?? task.notes ?? existing?.answer ?? ''); setMistake(existing?.mistake || ''); setRating(existing?.rating || ''); setSaved(false); setError('');
  }, [task.id]);
  const academic = !['university', 'activity', 'review'].includes(task.category) && !task.roadmapStepId;
  const attempts = normalizeLearning(data.learning).attempts.filter(entry => entry.subjectId === (task.subjectId || '') && entry.topic === session.topic).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const taskAttempt = normalizeLearning(data.learning).attempts.find(entry => entry.taskId === task.id);
  const answerValue = typeof draft === 'string' ? draft : answer;
  const updateAnswer = value => { setAnswer(value); onDraftChange?.(value); setSaved(false); };
  const save = event => {
    event.preventDefault();
    if (!rating) { setError('Wie sicher konntest du die Aufgabe bearbeiten?'); return; }
    try {
      onChange(current => saveLearningAttempt(current, { id: taskAttempt?.id, taskId: task.id, subjectId: task.subjectId || '', topic: session.topic, questionId: session.questions?.[0]?.id || session.topic, answer: answerValue, mistake, rating, date: today }));
      setSaved(true); setError('');
    } catch { setError('Die Reflexion konnte nicht gespeichert werden. Bitte versuche es erneut.'); }
  };
  return <section className="guided-learning" aria-label="So lernst du">
    <div className="guided-intro">{showObjective && <><p className="guided-eyebrow">{academic ? 'SO LERNST DU' : 'DEIN NÄCHSTER SCHRITT'}</p><h3>{session.objective}</h3></>}<p className="guided-result"><Check size={15} aria-hidden="true"/><span>{session.expectedResult}</span></p></div>
    <details className="guided-details"><summary>Warum diese Einheit?</summary><p>{session.why}</p></details>
    <div className="guided-first"><strong>Zuerst</strong><p>{session.firstStep}</p></div>
    <ol className="guided-phases" aria-label="Ablauf deiner Einheit">{session.phases.map((phase, index) => <li key={`${phase.title}-${index}`}><span className="guided-phase-number" aria-hidden="true">{index + 1}</span><div><div className="guided-phase-heading"><strong>{phase.title}</strong><span>{phase.minutes} min</span></div><p>{phase.action}</p></div></li>)}</ol>
    {session.provisional && <p className="guided-caveat">Das genaue Unterrichtsthema ist noch offen. Wähle eine passende Aufgabe aus deinem Kurs; diese Einheit legt keine unbekannten Klausurthemen fest.</p>}
    {(session.passage || session.words?.length || session.questions?.length) && <details className="guided-details" open><summary>Übung öffnen</summary><div className="guided-practice">
      {session.materialLabel && <p className="guided-caveat">{session.materialLabel}</p>}
      {session.passage && <blockquote className="guided-passage">{session.passage}</blockquote>}
      {session.words?.length > 0 && <div className="guided-words">{session.words.map((word, index) => <details key={`${word.word}-${index}`}><summary>{word.word}</summary><p>{word.meaning}</p>{word.example && <p lang="en">{word.example}</p>}</details>)}</div>}
      {session.questions?.map((question, index) => <div className="guided-question" key={question.id}><h4>{session.questions.length > 1 ? `Aufgabe ${index + 1}` : 'Deine Aufgabe'}</h4><p>{question.prompt}</p><details className="guided-solution"><summary>Lösung vergleichen</summary><div><p>{question.solution}</p><p className="guided-caveat">{question.explanation}</p></div></details></div>)}
      {session.template && <details className="guided-solution"><summary>Formulierungshilfe</summary><p>{session.template}</p></details>}
      {session.criteria?.length > 0 && <div className="guided-criteria"><h4>So prüfst du dein Ergebnis</h4><ul>{session.criteria.map(criterion => <li key={criterion}>{criterion}</li>)}</ul></div>}
      {session.sampleAnswer && <details className="guided-solution"><summary>Beispiel vergleichen</summary><div><p className="guided-caveat">Schreibe zuerst selbst. Das ist eine mögliche Antwort, keine verbindliche Musterlösung oder Benotung.</p><p>{session.sampleAnswer}</p></div></details>}
    </div></details>}
    {session.resources?.length > 0 && <details className="guided-details"><summary>Passende Materialien</summary><div className="guided-resource-list">{session.resources.map(resource => <div key={resource.title}>{resource.url ? <a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}<ArrowUpRight size={15} aria-hidden="true"/></a> : <strong>{resource.title}</strong>}<p>{resource.hint}</p></div>)}</div></details>}
    {!academic && <Field label="Dein Ergebnis oder deine Notizen" help={onDraftChange ? 'Dein Entwurf wird automatisch gespeichert.' : undefined}><textarea value={answerValue} onChange={event => updateAnswer(event.target.value)} rows={4} maxLength={onDraftChange ? 5000 : 20000} placeholder="Halte dein tatsächliches Ergebnis und den nächsten Schritt fest …"/></Field>}
    {academic && <details className="guided-details"><summary>Ergebnis & Wiederholung</summary><form className="guided-reflection" onSubmit={save}>
      <Field label="Deine Antwort oder dein Lösungsweg" help={onDraftChange ? 'Dein Entwurf wird automatisch gespeichert. Die Selbstprüfung vergibt keine Schulnote und keinen IELTS-Bandwert.' : 'Die Selbstprüfung vergibt keine Schulnote und keinen IELTS-Bandwert.'}><textarea value={answerValue} onChange={event => updateAnswer(event.target.value)} rows={5} maxLength={onDraftChange ? 5000 : 20000} placeholder="Schreibe deinen Absatz, Rechenweg oder eine kurze Zusammenfassung …"/></Field>
      <Field label="Ein Fehler oder eine Erkenntnis"><textarea value={mistake} onChange={event => { setMistake(event.target.value); setSaved(false); }} rows={2} maxLength={2000} placeholder="Was war schwierig? Was machst du nächstes Mal anders?"/></Field>
      <fieldset className="guided-rating"><legend>Wie sicher warst du?</legend><div>{RATINGS.map(option => <button type="button" key={option.value} aria-pressed={rating === option.value} onClick={() => { setRating(option.value); setSaved(false); setError(''); }}>{option.label}</button>)}</div></fieldset>
      {error && <p role="alert" className="field-error">{error}</p>}
      <Button type="submit"><Check size={16}/>{saved ? 'Reflexion gespeichert' : 'Reflexion speichern'}</Button>
      {saved && <p className="guided-saved" role="status">Gespeichert. Wiederholung: {dateLabel(taskAttempt?.nextReviewDate || session.reviewDate)} · Die Aufgabe kannst du anschließend abschließen.</p>}
      {taskAttempt && !saved && <p className="guided-review"><RotateCcw size={15} aria-hidden="true"/>Nächste Wiederholung: {dateLabel(taskAttempt.nextReviewDate)}</p>}
    </form></details>}
    {session.helpRecommendation && <aside className="guided-support"><strong>Gezielt Hilfe holen</strong><p>{session.helpRecommendation}</p></aside>}
    {academic && attempts.length > 0 && <details className="guided-details"><summary>Bisherige Reflexionen · {attempts.length}</summary><div className="guided-history">{attempts.map(attempt => <div key={attempt.id}><div><strong>{dateLabel(attempt.date)} · {RATINGS.find(option => option.value === attempt.rating)?.label}</strong>{attempt.mistake && <p>{attempt.mistake}</p>}<span>Wiederholen: {dateLabel(attempt.nextReviewDate)}</span></div><button type="button" className="icon-button" aria-label={`Reflexion vom ${dateLabel(attempt.date)} löschen`} onClick={() => { onChange(current => removeLearningAttempt(current, attempt.id)); if (attempt.taskId === task.id) { setSaved(false); setRating(''); } }}><Trash2 size={16}/></button></div>)}</div></details>}
  </section>;
}
