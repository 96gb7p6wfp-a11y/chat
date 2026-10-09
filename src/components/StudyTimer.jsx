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
  return <section className="study-launcher stack compact" aria-label="Study this task">
    <div className="section-heading"><div><h3>Make room to focus</h3><p className="field-help">Track a session separately from completing this task.</p></div><Clock3 size={19}/></div>
    {sameTask ? <Button variant="secondary" onClick={onOpen}>Open focus timer</Button> : <div className="focus-launch-controls">
      <Field label="Session minutes"><input type="number" min="5" max="180" step="1" value={minutes} onChange={event => setMinutes(event.target.value)}/></Field>
      <Button onClick={() => onStart(Number(minutes))} disabled={!Number.isInteger(Number(minutes)) || Number(minutes) < 5 || Number(minutes) > 180}><Play size={16}/>Start focus session</Button>
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
  return <aside className="focus-dock" aria-label="Active focus session">
    <button className="focus-dock-title" aria-label="Open focus timer" onClick={onOpen}><span>{timer.running ? 'FOCUS SESSION' : 'PAUSED'}</span><strong>{timer.active.taskTitle}</strong></button>
    <span className="focus-dock-time">{formatFocusClock(timer.remainingSeconds)}</span>
    <button className="icon-button" aria-label={timer.running ? 'Pause focus' : 'Resume focus'} onClick={timer.running ? onPause : onResume}>{timer.running ? <Pause size={17}/> : <Play size={17}/>}</button>
    <button className="icon-button" aria-label="Finish & save" onClick={onFinish}><Square size={16}/></button>
  </aside>;
}

export function StudyDialog({ data, onClose, onPause, onResume, onFinish, onDiscard, onTask }) {
  const timer = useFocusTime(data);
  if (!timer.active) return null;
  return <Modal title="Focus session" onClose={onClose}><div className="focus-session stack">
    <div><p className="page-kicker">ONE THING AT A TIME</p><h2 className="focus-session-title">{timer.active.taskTitle}</h2></div>
    <div className="focus-clock-block"><span className="focus-clock" role="timer" aria-label="Remaining focus time">{formatFocusClock(timer.remainingSeconds)}</span><p>{timer.running ? 'Time to work on one concrete step.' : 'Paused. Your break is not counted.'}</p><span className="field-help">Elapsed {formatFocusClock(timer.elapsedSeconds)} · {Math.round(timer.targetSeconds / 60)} min session</span></div>
    <div className="focus-controls"><Button variant="secondary" onClick={timer.running ? onPause : onResume}>{timer.running ? <Pause size={16}/> : <Play size={16}/>} {timer.running ? 'Pause focus' : 'Resume focus'}</Button><Button onClick={onFinish}><Square size={15}/>Finish & save</Button></div>
    <Button variant="ghost" onClick={onTask}>View task & notes</Button>
    <p className="field-help">The timer keeps running when you leave or close the app and stops at the session limit. Pause before taking a break. Saving time does not complete the task.</p>
    <button className="text-button remove-task" onClick={onDiscard}>Discard this session</button>
  </div></Modal>;
}

export function StudySaved({ task, seconds, onClose, onTask, onComplete }) {
  return <Modal title="Session saved" onClose={onClose}><div className="stack"><div className="focus-saved"><Clock3 size={25}/><strong>{formatStudyDuration(seconds)}</strong><span>{seconds > 0 ? 'Timed study saved to your progress' : 'No elapsed study time to record'}</span></div><p className="muted">{task?.title || 'Your focus session'}{task && !task.completed ? ' — decide whether you have finished the actual work.' : ''}</p><div className="sheet-footer">{task && <Button variant="secondary" onClick={onTask}>Back to task</Button>}{task && !task.completed && <Button onClick={onComplete}>Complete task</Button>}{!task && <Button onClick={onClose}>Done</Button>}</div></div></Modal>;
}
