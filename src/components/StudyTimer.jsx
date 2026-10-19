import React, { useEffect, useRef, useState } from 'react';
import { Clock3, Pause, Play, Square } from 'lucide-react';
import { getStudyTimer } from '../study.js';
import { Button, Field, Modal } from './UI.jsx';

export function formatFocusClock(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function formatStudyDuration(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60), rest = value % 60;
  return [hours && `${hours}h`, minutes && `${minutes} min`, (rest || !value) && `${rest}s`].filter(Boolean).join(' ');
}

function useFocusTime(data) {
  const [now, setNow] = useState(() => Date.now());
  const active = data.study?.active;
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    if (!active) return;
    const interval = setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [active?.id, active?.runningSince, active?.intervals.length]);
  return getStudyTimer(data, now);
}

export function StudyLauncher({ task, today, active, onStart, onOpen }) {
  const [minutes, setMinutes] = useState(() => Math.min(180, Math.max(5, task.minutes || 25)));
  if (task.date > today) return null;
  const sameTask = active?.taskId === task.id;
  return <section className="study-launcher stack compact" aria-label="Diese Aufgabe lernen">
    <div className="section-heading"><div><h3>Zeit für einen klaren Schritt</h3><p className="field-help">Lernzeit speichern und Aufgabe abschließen sind getrennte Schritte.</p></div><Clock3 size={19}/></div>
    {sameTask ? <Button variant="secondary" onClick={onOpen}>Fokustimer öffnen</Button> : <div className="focus-launch-controls">
      <Field label="Dauer in Minuten" className="focus-minute-field"><input type="number" min="5" max="180" step="1" value={minutes} onChange={event => setMinutes(event.target.value)}/></Field>
      <Button onClick={() => onStart(Number(minutes))} disabled={!Number.isInteger(Number(minutes)) || Number(minutes) < 5 || Number(minutes) > 180}><Play size={16}/>Fokus starten</Button>
    </div>}
  </section>;
}

export function StudyDock({ data, onOpen, onPause, onResume, onFinish, onExpire }) {
  const timer = useFocusTime(data);
  const expired = useRef(null);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  useEffect(() => {
    if (timer.finished && expired.current !== timer.active?.id) {
      expired.current = timer.active.id;
      expireRef.current?.();
    }
  }, [timer.finished, timer.active?.id]);
  if (!timer.active) return null;
  return <aside className="focus-dock" aria-label="Aktive Lerneinheit">
    <button className="focus-dock-title" aria-label="Fokustimer öffnen" onClick={onOpen}><span>{timer.running ? 'FOKUS' : 'PAUSIERT'}</span><strong>{timer.active.taskTitle}</strong></button>
    <span className="focus-dock-time">{formatFocusClock(timer.remainingSeconds)}</span>
    <button className="icon-button" aria-label={timer.running ? 'Pausieren' : 'Fortsetzen'} onClick={timer.running ? onPause : onResume}>{timer.running ? <Pause size={17}/> : <Play size={17}/>}</button>
    <button className="icon-button" aria-label="Beenden & speichern" onClick={onFinish}><Square size={16}/></button>
  </aside>;
}

export function StudyDialog({ data, onClose, onPause, onResume, onFinish, onDiscard, onTask }) {
  const timer = useFocusTime(data);
  if (!timer.active) return null;
  return <Modal title="Fokuszeit" onClose={onClose}><div className="focus-session stack">
    <div><p className="page-kicker">EIN SCHRITT NACH DEM ANDEREN</p><h2 className="focus-session-title">{timer.active.taskTitle}</h2></div>
    <div className="focus-clock-block"><span className="focus-clock" role="timer" aria-label="Verbleibende Fokuszeit">{formatFocusClock(timer.remainingSeconds)}</span><p>{timer.running ? 'Arbeite jetzt an einem konkreten Schritt.' : 'Pausiert. Die Pause zählt nicht als Lernzeit.'}</p><span className="field-help">Gelernt: {formatFocusClock(timer.elapsedSeconds)} · {Math.round(timer.targetSeconds / 60)} min geplant</span></div>
    <div className="focus-controls"><Button variant="secondary" onClick={timer.running ? onPause : onResume}>{timer.running ? <Pause size={16}/> : <Play size={16}/>} {timer.running ? 'Pausieren' : 'Fortsetzen'}</Button><Button onClick={onFinish}><Square size={15}/>Beenden & speichern</Button></div>
    <Button variant="ghost" onClick={onTask}>Aufgabe & Notizen öffnen</Button>
    <p className="field-help">Der Timer läuft auch beim Verlassen der App bis zum Zeitlimit weiter. Pausiere vor einer Pause. Gespeicherte Lernzeit schließt die Aufgabe nicht automatisch ab.</p>
    <button className="text-button remove-task" onClick={onDiscard}>Diese Einheit verwerfen</button>
  </div></Modal>;
}

export function StudySaved({ task, seconds, onClose, onTask, onComplete }) {
  return <Modal title="Lernzeit gespeichert" onClose={onClose}><div className="stack"><div className="focus-saved"><Clock3 size={25}/><strong>{formatStudyDuration(seconds)}</strong><span>{seconds > 0 ? 'Gemessene Lernzeit im Fortschritt gespeichert' : 'Noch keine Lernzeit zu speichern'}</span></div><p className="muted">{task?.title || 'Deine Lerneinheit'}{task && !task.completed ? ' — ist die eigentliche Aufgabe schon erledigt?' : ''}</p><div className="sheet-footer">{task && <Button variant="secondary" onClick={onTask}>Zur Aufgabe</Button>}{task && !task.completed && <Button onClick={onComplete}>Aufgabe abschließen</Button>}{!task && <Button onClick={onClose}>Fertig</Button>}</div></div></Modal>;
}
