import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, ChevronRight, Flag, GraduationCap, Languages, Settings2, UserRound } from 'lucide-react';
import { Button } from './UI.jsx';
import UniversityGoals from './UniversityGoals.jsx';
import TestJourney from './TestJourney.jsx';
import Profile from './Profile.jsx';
import Plan from './Plan.jsx';
import GoalRoadmap from './GoalRoadmap.jsx';
import './growth-hubs.css';

const TITLES = { goals:'Studienziele', tests:'IELTS & SAT', roadmap:'Dein Bewerbungsweg', activities:'Erfahrungen & Projekte', profile:'Dein Profil', settings:'Einstellungen', universities:'Gespeicherte Hochschulen' };
export default function FutureHub({ data, today, onChange, notify, initialView='overview', initialSection='Goals', initialTest='sat', onLearn, onApplyAbiturTarget, onPractice, onSelectDay, onOpenTask, onOpenProfile, onOpenProgress, onOpenSchoolImport, onOpenSchedule, onRestartSetup, onExport, onImport, initialPathway }) {
  const [view,setView]=useState(initialView);
  useEffect(()=>setView(initialView),[initialView,initialSection,initialTest]);
  const goals=(data.universityGoals?.goals||[]).filter(goal=>goal.active!==false);
  const primary=[...goals].sort((a,b)=>({high:0,normal:1,low:2}[a.priority]??1)-({high:0,normal:1,low:2}[b.priority]??1))[0];
  const profileProps={data,today,onChange,notify,onOpenProfile,onOpenProgress,onOpenSchoolImport,onOpenSchedule,onRestartSetup,onExport,onImport,embedded:true};
  const open=next=>{setView(next);window.scrollTo({top:0,behavior:'instant'});};
  return <div className="growth-hub future-hub">
    {view==='overview' ? <><header className="hub-header"><div><p className="page-kicker">DEINE RICHTUNG</p><h1>Zukunft</h1></div><button className="icon-button" aria-label="Einstellungen öffnen" onClick={()=>open('settings')}><Settings2 size={20}/></button></header>
      <section className="destination-summary"><span className="eyebrow">{primary ? 'DEIN STUDIENZIEL' : 'WO MÖCHTEST DU HIN?'}</span><h2>{primary ? ({ucl:'UCL',ucla:'UCLA',berkeley:'UC Berkeley'}[primary.institutionId]||primary.name) : 'Dein Ziel gibt die Richtung.'}</h2><p>{primary ? `${primary.programme} · ${primary.entryYear}` : 'Wähle einen Studiengang. Daraus entstehen überprüfbare Anforderungen und nächste Schritte.'}</p><Button onClick={()=>open('goals')}>{primary ? 'Anforderungen & nächster Schritt' : 'Studienziel wählen'}<ArrowRight size={17}/></Button></section>
      <div className="hub-list">{[{view:'tests',Icon:Languages,title:'IELTS & SAT',description:'Entscheiden, einschätzen, vorbereiten'},{view:'roadmap',Icon:Flag,title:'Bewerbungsweg',description:'Meilensteine und Unterlagen'},{view:'activities',Icon:BriefcaseBusiness,title:'Erfahrungen & Projekte',description:'Deinen Beitrag sichtbar machen'},{view:'profile',Icon:UserRound,title:'Mein Profil',description:'Persönliche Ziele und Hintergrund'}].map(({view:next,Icon,title,description})=><button className="hub-row" key={next} onClick={()=>open(next)}><Icon size={20}/><span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={17}/></button>)}</div>
      {data.universities.length>0&&<button className="text-button" onClick={()=>open('universities')}>{data.universities.length} gespeicherte Hochschulen<ChevronRight size={14}/></button>}
    </> : <><header className="hub-detail-header"><button className="text-button" onClick={()=>open('overview')}><ArrowLeft size={16}/>Zukunft</button><h1>{TITLES[view]||'Dein Profil'}</h1></header>
      {view==='goals'&&<UniversityGoals embedded data={data} today={today} onChange={onChange} notify={notify} onLearn={onLearn} onApplyAbiturTarget={onApplyAbiturTarget}/>}
      {view==='tests'&&<TestJourney embedded data={data} today={today} onChange={onChange} onPractice={onPractice} initialTest={initialTest}/>}
      {view==='roadmap'&&<><GoalRoadmap data={data} today={today} onGoals={()=>open('goals')}/><details className="product-details"><summary>Allgemeine Planung für USA & Deutschland</summary><Plan embedded data={data} today={today} onChange={onChange} notify={notify} initialView="roadmap" initialPathway={initialPathway} onSelectDay={onSelectDay} onOpenTask={onOpenTask} onOpenProfile={onOpenProfile}/></details></>}
      {['activities','profile','settings','universities'].includes(view)&&<Profile {...profileProps} key={`${view}-${initialSection}`} initialSection={view==='activities'?'Activities':view==='settings'?'Settings':view==='universities'?'Universities':initialSection}/>}
    </>}
  </div>;
}
