import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, ChartNoAxesColumnIncreasing, ChevronRight, Clock3, GraduationCap, Layers3, ListChecks, Target } from 'lucide-react';
import { getDailyPlan } from '../coach.js';
import { subjectLabel } from '../i18n.js';
import { Button, formatDate, formatMinutes } from './UI.jsx';
import Plan from './Plan.jsx';
import Progress from './Progress.jsx';
import AcademicGrades from './AcademicGrades.jsx';
import CurriculumTopics from './CurriculumTopics.jsx';
import HessenAbitur from './HessenAbitur.jsx';
import AbiturTarget from './AbiturTarget.jsx';
import './learning-hub.css';

const VIEWS = {
  week: { label: 'Wochenplan', description: 'Deine nächsten Lerntage', icon: ListChecks, tone: 'school' },
  timetable: { label: 'Stundenplan', description: 'Unterricht, Räume und freie Zeiten', icon: CalendarDays, tone: 'school' },
  exams: { label: 'Prüfungen', description: 'Vorbereiten und nachbesprechen', icon: BookOpen, tone: 'exam' },
  grades: { label: 'Noten', description: 'Ergebnisse und nächste Zielnote', icon: ChartNoAxesColumnIncreasing, tone: 'school' },
  abitur: { label: 'Abiturziel', description: 'Vom Ziel zurück zu Q1–Q4', icon: GraduationCap, tone: 'test' },
  topics: { label: 'Unterrichtsthemen', description: 'Auswählen und direkt üben', icon: Layers3, tone: 'project' },
  progress: { label: 'Wochenrückblick', description: 'Was wirkt? Was änderst du?', icon: Target, tone: 'personal' },
  events: { label: 'Termine', description: 'Abgaben, Projekte und Verpflichtungen', icon: CalendarDays, tone: 'exam' },
  schedule: { label: 'Lernzeiten', description: 'Dein realistischer Wochenrhythmus', icon: Clock3, tone: 'personal' },
};
const normalizeView = value => Object.hasOwn(VIEWS, value) ? value : 'overview';

/** One vertical academic menu; existing records and detailed editors stay intact. */
export default function LearningHub({ data, today, onChange, notify, onSelectDay, onOpenProfile, onOpenTask, onOpenSchoolImport, onPractice, initialView = 'overview', initialSubjectId = '', onOpenFuture }) {
  const recordsRef = useRef(null);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [view, setView] = useState(() => initialSubjectId ? 'grades' : normalizeView(initialView));
  useEffect(() => { setView(initialSubjectId ? 'grades' : normalizeView(initialView)); }, [initialView, initialSubjectId]);
  const plan = getDailyPlan(data, today, today);
  const first = plan.tasks.find(task => !task.completed && ['academics', 'language'].includes(task.category));
  const nextExam = [...data.exams].filter(exam => exam.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const open = next => { setView(normalizeView(next)); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const changePlanView = next => {
    if (next === 'roadmap' && onOpenFuture) onOpenFuture('roadmap');
    else if (Object.hasOwn(VIEWS, next)) setView(next);
  };
  const common = { data, today, onChange, notify, onSelectDay, onOpenProfile, onOpenTask, onOpenSchoolImport, onPractice };
  const menuRow = ([key, item]) => {
    const Icon = item.icon;
    const description = key === 'exams' && nextExam ? `${subjectLabel(data.subjects.find(subject => subject.id === nextExam.subjectId))} · ${formatDate(nextExam.date)}` : item.description;
    return <button type="button" aria-label={item.label} className={`learning-menu-row learning-tone-${item.tone}`} onClick={() => open(key)} key={key}><span className="learning-menu-icon"><Icon size={19} strokeWidth={1.6}/></span><span><strong>{item.label}</strong><small>{description}</small></span><ChevronRight size={17}/></button>;
  };
  const organization = ['progress', 'events', 'schedule'];
  return <section className="learning-hub" aria-label="Dein Lernen">
    {view === 'overview' ? <>
      <header className="page-header"><p className="page-kicker">DEIN AKADEMISCHER WEG</p><h1 className="page-title">Lernen</h1></header>
      <section className="learning-next" aria-label="Dein nächster Lernschritt"><span className="learning-next-label">JETZT SINNVOLL</span><h2>{first?.objective || first?.title || 'Wähle dein aktuelles Unterrichtsthema.'}</h2>{first ? <Button onClick={() => onOpenTask?.(first)}>Lernen starten <span>{formatMinutes(first.minutes)}</span><ArrowRight size={16}/></Button> : <Button onClick={() => open('topics')}>Thema auswählen <ArrowRight size={16}/></Button>}</section>
      <nav className="learning-menu" aria-label="Lernbereiche">{Object.entries(VIEWS).filter(([key]) => !organization.includes(key)).map(menuRow)}</nav>
      <details className="learning-more"><summary>Rückblick & Organisation</summary><nav className="learning-menu" aria-label="Weitere Lernbereiche">{Object.entries(VIEWS).filter(([key]) => organization.includes(key)).map(menuRow)}</nav></details>
    </> : <>
      <header className="learning-detail-heading"><button type="button" className="learning-back" onClick={() => open('overview')} aria-label="Zurück zu Lernen"><ArrowLeft size={18}/><span>Lernen</span></button><h1>{VIEWS[view].label}</h1></header>
      {['week', 'timetable', 'exams', 'events', 'schedule'].includes(view) && <Plan {...common} initialView={view} embedded onViewChange={changePlanView}/>}
      {view === 'grades' && <AcademicGrades {...common} key={initialSubjectId || 'overview'} initialSubjectId={initialSubjectId}/>}
      {view === 'topics' && <CurriculumTopics data={data} onChange={onChange} onPractice={onPractice}/>}
      {view === 'abitur' && <div className="learning-abitur stack"><AbiturTarget data={data} today={today} onChange={onChange} notify={notify} onOpenRecords={() => { setRecordsOpen(true); requestAnimationFrame(() => recordsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })); }}/><details className="product-details" ref={recordsRef} open={recordsOpen} onToggle={event => setRecordsOpen(event.currentTarget.open)}><summary>Halbjahresnoten und Prüfungsfächer bearbeiten</summary><HessenAbitur data={data} today={today} onChange={onChange} notify={notify}/></details></div>}
      {view === 'progress' && <Progress {...common} embedded onOpenPlan={open}/>}
    </>}
  </section>;
}
