import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, Clock3, Headphones, Play, RotateCcw, Trash2 } from 'lucide-react';
import { getGuidedSession, normalizeLearning, removeLearningAttempt, saveLearningAttempt } from '../guided-learning.js';
import { getTutorSession } from '../tutor.js';
import { Button, Field } from './UI.jsx';
import '../guided-learning.css';

const RATINGS = [{ value: 'again', label: 'Noch unsicher' }, { value: 'hard', label: 'Mit Mühe' }, { value: 'good', label: 'Selbstständig' }];
const STAGES = ['learn', 'practice', 'check', 'review'];
const STAGE_LABELS = { learn: 'Verstehen', practice: 'Selbst lösen', check: 'Vergleichen', review: 'Wiederholen' };
const dateLabel = date => date ? new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`)) : '';
const blankProgress = task => ({ id: task.id, taskId: task.id, unitId: '', stage: 'intro', questionIndex: 0, answers: {}, revealed: [], checks: {}, mistakes: {}, reviewAnswers: {}, startedAt: null, completedAt: null, updatedAt: new Date().toISOString() });
const savedProgress = (data, task) => data.learning?.sessions?.find(record => record.taskId === task.id) || blankProgress(task);
const savedMistake = record => record.mistakes?.[record.unitId] || '';
const safeResource = value => { try { return ['http:', 'https:'].includes(new URL(value).protocol) ? value : ''; } catch { return ''; } };

/** One exercise at a time. Answers and self-checks never imply an exam grade. */
export default function GuidedLearning({ data, task, today, onChange, draft, onDraftChange, onFinish, showObjective = true }) {
  const [progress, setProgress] = useState(() => savedProgress(data, task));
  const progressRef = useRef(progress);
  const sessionRef = useRef(null);
  const [customTopic, setCustomTopic] = useState('');
  const [error, setError] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [globalMistake, setGlobalMistake] = useState(() => savedMistake(savedProgress(data, task)));
  const [audioReady, setAudioReady] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioError, setAudioError] = useState('');
  useEffect(() => {
    const next = savedProgress(data, task);
    progressRef.current = next; setProgress(next); setCustomTopic(''); setError('');
    setGlobalMistake(savedMistake(next));
  }, [task.id]);
  useEffect(() => {
    const speech = globalThis.speechSynthesis;
    if (!speech) return;
    const update = () => setAudioReady(speech.getVoices().some(voice => /^en\b/i.test(voice.lang)));
    update(); speech.addEventListener?.('voiceschanged', update);
    return () => { speech.removeEventListener?.('voiceschanged', update); speech.cancel(); };
  }, []);
  const tutor = getTutorSession(data, task, today, progress.unitId || '');
  const legacy = getGuidedSession(data, task, today);
  const helpRecommendation = tutor.helpRecommendation || legacy.helpRecommendation;
  const active = tutor.status === 'ready';
  const questions = tutor.questions || [];
  const index = Math.max(0, Math.min(progress.questionIndex || 0, questions.length - 1));
  const question = questions[index];
  const stage = active && ['intro', ...STAGES, 'done'].includes(progress.stage) ? progress.stage : 'intro';
  const checks = progress.checks || {};
  const uncertain = questions.filter(item => checks[item.id] !== 'good');
  const attempt = normalizeLearning(data.learning).attempts.find(entry => entry.taskId === task.id && entry.topic === (tutor.topicId || tutor.unitId) && entry.date === today);
  const history = normalizeLearning(data.learning).attempts.filter(entry => entry.taskId === task.id || (entry.subjectId === (task.subjectId || '') && entry.topic === (tutor.topicId || tutor.unitId))).sort((a, b) => b.date.localeCompare(a.date));
  const pendingReviews = uncertain.filter(item => !(progress.reviewAnswers?.[item.id] || '').trim()).length;
  const choices = tutor.choices || [];
  const phase = tutor.phases?.find(item => item.key === stage);
  useEffect(() => {
    const node = sessionRef.current;
    const dialog = node?.closest('[role="dialog"]');
    if (!node || !dialog) return;
    const headerHeight = dialog.querySelector('.modal-header')?.getBoundingClientRect().height || 0;
    const offset = node.getBoundingClientRect().top - dialog.getBoundingClientRect().top - headerHeight - 12;
    dialog.scrollTop = Math.max(0, dialog.scrollTop + offset);
  }, [stage, index, progress.unitId]);
  const persist = patch => {
    const next = { ...progressRef.current, ...patch, id: task.id, taskId: task.id, updatedAt: new Date().toISOString() };
    progressRef.current = next; setProgress(next); setError('');
    onChange?.(current => ({ ...current, learning: { ...current.learning, sessions: [...(current.learning?.sessions || []).filter(item => item.taskId !== task.id), next] } }));
    return next;
  };
  const changeAnswer = (key, value) => persist({ answers: { ...progressRef.current.answers, [key]: value } });
  const chooseTopic = value => {
    globalThis.speechSynthesis?.cancel(); setAudioPlaying(false); setAudioError('');
    const choice = getTutorSession(data, task, today, value);
    setGlobalMistake(progressRef.current.mistakes?.[choice.topicId || value] || '');
    persist({ unitId: choice.status === 'ready' ? choice.unitId || choice.topicId : value, stage: 'intro', questionIndex: 0, completedAt: null });
  };
  function playAudio() {
    const speech = globalThis.speechSynthesis;
    if (!speech || !audioReady || !tutor.audioText) return;
    speech.cancel(); setAudioError('');
    const utterance = new SpeechSynthesisUtterance(tutor.audioText);
    utterance.lang = 'en-GB'; utterance.rate = .9;
    utterance.voice = speech.getVoices().find(voice => /^en-GB/i.test(voice.lang)) || speech.getVoices().find(voice => /^en\b/i.test(voice.lang));
    utterance.onstart = () => setAudioPlaying(true);
    utterance.onend = () => setAudioPlaying(false);
    utterance.onerror = () => { setAudioPlaying(false); setAudioError('Die Stimme konnte nicht abgespielt werden. Nutze das offizielle Hörmaterial oder wähle ein anderes Modul.'); };
    speech.speak(utterance);
  }
  function start() {
    if (!active || !questions.length) return;
    persist({ unitId: tutor.unitId || tutor.topicId, stage: 'learn', questionIndex: 0, startedAt: progress.startedAt || new Date().toISOString(), completedAt: null });
  }
  function checkAnswer() {
    if (!(progress.answers?.[question.id] || '').trim()) { setError('Schreibe zuerst deinen eigenen Versuch. Ein kurzer Ansatz reicht.'); return; }
    persist({ stage: 'check', revealed: [...new Set([...(progress.revealed || []), question.id])] });
  }
  function nextQuestion() {
    if (!checks[question.id]) { setError('Vergleiche deinen Versuch und wähle deine Einschätzung.'); return; }
    persist(index + 1 < questions.length ? { stage: 'practice', questionIndex: index + 1 } : { stage: 'review' });
  }
  function finish() {
    if (pendingReviews) { setError('Löse die unsicheren Aufgaben noch einmal. Wenn du noch nicht weiterkommst, notiere deinen Ansatz oder die offene Frage.'); return; }
    if (questions.some(item => !checks[item.id])) { setError('Prüfe zuerst jede Aufgabe. Deine Einschätzung bleibt eine Selbstprüfung.'); return; }
    const rating = questions.some(item => checks[item.id] === 'again') ? 'again' : questions.some(item => checks[item.id] === 'hard') ? 'hard' : 'good';
    const answer = questions.map((item, number) => `${number + 1}. ${item.prompt}\n${progress.answers?.[item.id] || ''}`).join('\n\n').slice(0, 20000);
    const mistake = globalMistake.trim().slice(0, 2000);
    const next = { ...progressRef.current, stage: 'done', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const input = { id: attempt?.id, taskId: task.id, subjectId: task.subjectId || '', topic: tutor.topicId || tutor.unitId, questionId: (uncertain.map(item => item.id).join(',') || questions[0]?.id || tutor.topicId).slice(0, 200), answer, mistake, rating, date: today };
    try {
      saveLearningAttempt(data, input);
      progressRef.current = next; setProgress(next); setError('');
      onChange?.(current => saveLearningAttempt({ ...current, learning: { ...current.learning, sessions: [...(current.learning?.sessions || []).filter(item => item.taskId !== task.id), next] } }, input));
      onFinish?.();
    } catch { setError('Die Einheit konnte nicht gespeichert werden. Deine Antworten bleiben erhalten.'); }
  }
  function mistakeChanged(value) {
    setGlobalMistake(value);
    persist({ mistakes: { ...progressRef.current.mistakes, [tutor.topicId || tutor.unitId || 'review']: value } });
  }
  const resources = (tutor.resources || legacy.resources || []).filter(item => safeResource(item.url));
  const resourceDetails = resources.length > 0 && <details className="tutor-details"><summary>Materialien & Quellen</summary><div className="tutor-resources">{resources.map(resource => <a key={resource.url} href={safeResource(resource.url)} target="_blank" rel="noopener noreferrer"><span>{resource.title}</span><ArrowUpRight size={15}/></a>)}</div></details>;

  if (tutor.status === 'action' || ['university', 'activity', 'review'].includes(task.category) || task.roadmapStepId) return <section ref={sessionRef} className="guided-learning tutor-action" aria-label="Dein nächster Schritt">
    {showObjective && <h3>{task.title}</h3>}
    <p className="tutor-action-first">{legacy.firstStep}</p>
    {!!task.steps?.length && <details className="tutor-details"><summary>Weitere Schritte</summary><ol>{task.steps.map((step, i) => <li key={i}>{step}</li>)}</ol></details>}
    <Field label="Dein Ergebnis oder deine Notizen"><textarea rows={4} maxLength={5000} value={draft ?? task.notes ?? ''} onChange={event => onDraftChange?.(event.target.value)} placeholder="Dein Ergebnis und der nächste Schritt …"/></Field>
    {resourceDetails}
  </section>;

  if (tutor.status === 'external') return <section ref={sessionRef} className="guided-learning" aria-label="Interaktive Lerneinheit"><div className="tutor-lesson-heading"><span className="tutor-kicker">{tutor.subject || 'PRÜFUNGSVORBEREITUNG'}</span><h3>{tutor.title || task.title}</h3><span className="tutor-time"><Clock3 size={14}/>{task.minutes} Min.</span></div><p className="tutor-reading">{tutor.explanation || tutor.unavailableReason || 'Diese Prüfungssimulation findet im offiziellen Testprogramm statt.'}</p>{resources[0] && <a className="button button-primary" href={safeResource(resources[0].url)} target="_blank" rel="noopener noreferrer">Offizielle Übung öffnen <ArrowUpRight size={16}/></a>}<details className="tutor-details"><summary>Ablauf ansehen</summary><ol>{legacy.phases?.map((item, i) => <li key={i}>{item.action}</li>)}</ol></details><p className="tutor-note">Eine vollständige Simulation wird im offiziellen Material durchgeführt. Hier entsteht kein automatisches Testergebnis.</p>{resourceDetails}</section>;

  return <section ref={sessionRef} className="guided-learning tutor-session" aria-label="Interaktive Lerneinheit">
    {stage === 'intro' ? <>
      <div className="tutor-lesson-heading"><span className="tutor-kicker">{tutor.subject || 'DEINE LERNEINHEIT'}</span><div className="tutor-title-row"><h3>{active ? tutor.title || tutor.topic : 'Welches Thema lernst du?'}</h3><span className="tutor-time"><Clock3 size={14}/>{task.minutes} Min.</span></div></div>
      {(!active || tutor.topicSource === 'selection' || progress.unitId) && <div className="tutor-topic-picker"><Field label="Lernthema wählen"><select value={choices.some(choice => choice.id === progress.unitId) ? progress.unitId : ''} onChange={event => chooseTopic(event.target.value)}><option value="">Bitte auswählen</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label || choice.title}</option>)}</select></Field>{!active && <p className="tutor-note">{tutor.unavailableReason || 'Dein genaues Thema ist noch offen. Wähle ein passendes Übungsmodul.'}</p>}<details className="tutor-details tutor-custom-topic"><summary>Eigenes Thema eingeben</summary><div className="tutor-custom-entry"><Field label="Dein Unterrichtsthema"><input value={customTopic} maxLength={200} onChange={event => setCustomTopic(event.target.value)} placeholder="Zum Beispiel: Integralrechnung"/></Field><Button variant="secondary" disabled={!customTopic.trim()} onClick={() => chooseTopic(customTopic.trim())}>Thema prüfen</Button></div></details></div>}
      {active && questions.length > 0 ? <><div className="tutor-first-exercise"><span className="tutor-kicker">DEINE ERSTE AUFGABE</span><p>{tutor.firstExercise || questions[0].prompt}</p></div><Button className="tutor-primary" onClick={start}><Play size={16}/>Lernen starten</Button>{tutor.topicSource === 'selection' && <p className="tutor-note">Gewähltes Übungsmodul · als Klausurthema noch nicht bestätigt.</p>}{!progress.unitId && <details className="tutor-details"><summary>Anderes Thema wählen</summary><Field label="Lernthema wählen"><select value="" onChange={event => chooseTopic(event.target.value)}><option value="">Modul auswählen</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label || choice.title}</option>)}</select></Field></details>}</> : <div className="tutor-unavailable"><strong>{tutor.status === 'unsupported' || tutor.status === 'unavailable' ? 'Für dieses Thema noch keine interaktive Übung' : 'Ein Thema auswählen, dann geht es los'}</strong><p className="tutor-note">{tutor.status === 'unsupported' || tutor.status === 'unavailable' ? 'Wähle ein verfügbares Modul. Ungeprüfte Aufgaben werden nicht als fertige Lerneinheit angezeigt.' : 'Die verfügbaren Module enthalten einen kurzen Lerntext, konkrete Aufgaben und Lösungen.'}</p></div>}
    </> : stage === 'done' ? <div className="tutor-complete"><CheckCircle2 size={34}/><span className="tutor-kicker">EINHEIT GESPEICHERT</span><h3>{tutor.title}</h3><p>{questions.length} Aufgaben bearbeitet. {uncertain.length ? `${uncertain.length} für gezielte Wiederholung vorgemerkt.` : 'Du hast alle Aufgaben selbst geprüft.'}</p><p className="tutor-note">Wiederholung: {dateLabel(attempt?.nextReviewDate || legacy.reviewDate)} · Selbstprüfung, keine Schulnote.</p><Button variant="secondary" onClick={() => persist({ stage: 'review' })}>Antworten ansehen <ArrowRight size={15}/></Button></div> : <>
      <div className="tutor-session-top"><button type="button" className="tutor-back" onClick={() => persist(stage === 'learn' ? { stage: 'intro' } : stage === 'practice' ? { stage: 'learn' } : stage === 'check' ? { stage: 'practice' } : { stage: 'check', questionIndex: questions.length - 1 })} aria-label="Vorheriger Lernschritt"><ArrowLeft size={18}/></button><div><span className="tutor-kicker">{STAGE_LABELS[stage]}</span><h3>{tutor.title}</h3></div><span className="tutor-time">{phase?.minutes ?? task.minutes} Min.</span></div>
      <div className="tutor-step-track" aria-label="Lernfortschritt">{STAGES.map((key, i) => <span className={key === stage ? 'current' : STAGES.indexOf(stage) > i ? 'passed' : ''} key={key} aria-current={key === stage ? 'step' : undefined}><span>{i + 1}</span><small>{STAGE_LABELS[key]}</small></span>)}</div>
      {stage === 'learn' && <div className="tutor-stage-content" key="learn"><div className="tutor-reading">{String(tutor.explanation || '').split(/\n\n/).filter(Boolean).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>{tutor.previousMistake && <details className="tutor-details"><summary>Dein letzter Lernhinweis</summary><p className="tutor-note">{tutor.previousMistake}</p></details>}{tutor.passage && <blockquote className="tutor-passage">{tutor.passage}</blockquote>}{tutor.requiresAudio && <ol className="tutor-listening-prompts" aria-label="Fragen vor dem Hören">{questions.map(item => <li key={item.id}>{item.prompt}</li>)}</ol>}{tutor.requiresAudio && <div className="tutor-audio"><Headphones size={20}/><div><strong>Eigene Hörübung</strong><p className="tutor-note">Synthetische Stimme · kein Originaltest</p></div><Button variant="secondary" disabled={!audioReady} onClick={audioPlaying ? () => { globalThis.speechSynthesis?.cancel(); setAudioPlaying(false); } : playAudio}>{audioPlaying ? 'Wiedergabe stoppen' : 'Hörtext abspielen'}</Button>{(!audioReady || audioError) && <p className="tutor-note">{audioError || 'Auf diesem Gerät ist noch keine englische Stimme verfügbar. Nutze das offizielle Hörmaterial oder wähle ein anderes Modul.'}</p>}</div>}{tutor.materialLabel && <p className="tutor-note">{tutor.materialLabel}</p>}<Button className="tutor-primary" disabled={tutor.requiresAudio && (!audioReady || !!audioError)} onClick={() => { globalThis.speechSynthesis?.cancel(); setAudioPlaying(false); persist({ stage: 'practice' }); }}>Zu den Aufgaben <ArrowRight size={16}/></Button></div>}
      {stage === 'practice' && question && <div className="tutor-stage-content" key={`practice-${question.id}`}><span className="tutor-question-count">AUFGABE {index + 1} VON {questions.length}</span><h4 className="tutor-question-prompt">{question.prompt}</h4>{question.hint && <details className="tutor-details"><summary>Ein Hinweis</summary><p className="tutor-note">{question.hint}</p></details>}<Field label="Deine Antwort"><textarea rows={question.kind === 'number' ? 3 : 5} maxLength={5000} value={progress.answers?.[question.id] || ''} onChange={event => changeAnswer(question.id, event.target.value)} placeholder={question.kind === 'number' ? 'Dein Ergebnis und Rechenweg …' : 'Dein eigener Versuch …'}/></Field><Button className="tutor-primary" onClick={checkAnswer}>Antwort prüfen <ArrowRight size={16}/></Button></div>}
      {stage === 'check' && question && <div className="tutor-stage-content" key={`check-${question.id}`}><span className="tutor-question-count">AUFGABE {index + 1} VON {questions.length}</span><h4 className="tutor-question-prompt">{question.prompt}</h4><details className="tutor-details"><summary>Deine Antwort</summary><p className="tutor-own-answer">{progress.answers?.[question.id] || 'Noch kein eigener Versuch gespeichert.'}</p></details><div className="tutor-model-answer"><span className="tutor-kicker">MUSTERLÖSUNG</span><p>{question.solution}</p>{question.explanation && <p className="tutor-note">{question.explanation}</p>}</div>{question.criteria?.length > 0 && <ul className="tutor-criteria">{question.criteria.map(criterion => <li key={criterion}>{criterion}</li>)}</ul>}{tutor.audioText && <details className="tutor-details"><summary>Hörtext vergleichen</summary><p className="tutor-reading">{tutor.audioText}</p></details>}<fieldset className="tutor-rating"><legend>Wie gut passt dein eigener Versuch?</legend><div>{RATINGS.map(option => <button type="button" key={option.value} aria-pressed={checks[question.id] === option.value} onClick={() => persist({ checks: { ...progressRef.current.checks, [question.id]: option.value } })}>{option.value === 'good' && <Check size={14}/>} {option.label}</button>)}</div></fieldset><p className="tutor-note">Deine Einschätzung steuert die Wiederholung. Sie ist keine automatische Benotung.</p><Button className="tutor-primary" disabled={!checks[question.id]} onClick={nextQuestion}>{index + 1 < questions.length ? 'Nächste Aufgabe' : 'Zur Wiederholung'} <ArrowRight size={16}/></Button></div>}
      {stage === 'review' && <div className="tutor-stage-content" key="review"><div className="tutor-review-heading"><RotateCcw size={21}/><div><h4>{uncertain.length ? `${uncertain.length} ${uncertain.length === 1 ? 'Aufgabe' : 'Aufgaben'} noch einmal` : 'Deine Erkenntnis sichern'}</h4><p className="tutor-note">{tutor.reviewPrompt || 'Erkläre die wichtigste Regel ohne nachzusehen. Korrigiere eine Stelle in deinem eigenen Versuch.'}</p></div></div>{uncertain.map((item, i) => <div className="tutor-retry" key={item.id}><strong>{i + 1}. {item.prompt}</strong><Field label={`Dein zweiter Versuch · ${i + 1}`}><textarea rows={3} maxLength={5000} value={progress.reviewAnswers?.[item.id] || ''} onChange={event => persist({ reviewAnswers: { ...progressRef.current.reviewAnswers, [item.id]: event.target.value } })} placeholder="Jetzt noch einmal ohne Musterlösung …"/></Field><details className="tutor-details"><summary>Noch einmal vergleichen</summary><p className="tutor-reading">{item.solution}</p>{item.followUp && <p className="tutor-note">Danach: {item.followUp}</p>}</details></div>)}<Field label="Dein wichtigster Fehler"><textarea rows={2} maxLength={2000} value={globalMistake} onChange={event => mistakeChanged(event.target.value)} placeholder={uncertain.length ? 'Was hast du korrigiert? Wie erkennst du es beim nächsten Mal?' : 'Welche Regel oder Formulierung möchtest du behalten?'}/></Field><Button className="tutor-primary" disabled={pendingReviews > 0} onClick={finish}><Check size={17}/>Einheit beenden</Button>{pendingReviews > 0 && <p className="tutor-note">Wiederhole zuerst die {pendingReviews === 1 ? 'offene Aufgabe' : `${pendingReviews} offenen Aufgaben`}. Ein Ansatz oder eine konkrete offene Frage reicht.</p>}<p className="tutor-note">Antworten und Fehler werden gespeichert. Schwierige Inhalte kommen früher zur Wiederholung.</p></div>}
    </>}
    {error && <p className="tutor-error" role="alert">{error}</p>}
    {stage !== 'intro' && resourceDetails}
    {history.length > 0 && <details className="tutor-details tutor-history"><summary>Bisherige Versuche · {history.length}</summary><div>{history.slice(0, 10).map((entry, historyIndex) => <article key={entry.id}><div className="tutor-history-heading"><span>{dateLabel(entry.date)} · {RATINGS.find(item => item.value === entry.rating)?.label || 'Selbstprüfung'}</span><button type="button" className="icon-button" aria-label={`Versuch ${historyIndex + 1} vom ${dateLabel(entry.date)} entfernen`} onClick={() => setPendingRemoval(entry.id)}><Trash2 size={15}/></button></div>{entry.mistake && <p className="tutor-note">{entry.mistake}</p>}<details className="tutor-details"><summary>Gespeicherte Antwort</summary><p className="tutor-own-answer">{entry.answer || 'Kein Antworttext gespeichert.'}</p></details><p className="tutor-note">Wiederholung: {dateLabel(entry.nextReviewDate)}</p>{pendingRemoval === entry.id && <div className="tutor-history-confirm" role="alert"><p>Diesen Versuch entfernen? Deine Antworten in der Lerneinheit bleiben erhalten.</p><div><Button variant="secondary" onClick={() => setPendingRemoval(null)}>Behalten</Button><Button variant="danger" onClick={() => { onChange?.(current => removeLearningAttempt(current, entry.id)); setPendingRemoval(null); }}>Versuch entfernen</Button></div></div>}</article>)}{history.length > 10 && <p className="tutor-note">Die letzten zehn Versuche. Alle Einträge bleiben in deiner Datensicherung erhalten.</p>}</div></details>}

    {helpRecommendation && stage === 'review' && <aside className="tutor-support"><strong>Gezielt Rückmeldung holen</strong><p>{helpRecommendation}</p></aside>}
  </section>;
}
