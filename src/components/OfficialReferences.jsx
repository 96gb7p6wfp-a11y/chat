import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Button, formatDate } from './UI.jsx';
import { getOfficialUniversityReference } from '../university-references.js';
import { PROVIDER_REFERENCES, getPublishedProviderDates } from '../provider-references.js';
import { rankCandidateTestDates } from '../test-journeys.js';
import './official-references.css';

export function UniversityReference({ goal, onApplyAbiturTarget }) {
  const reference = getOfficialUniversityReference(goal.institutionId);
  if (!reference || (reference.programmeSpecific && !/computer science|informatik/i.test(goal.programme))) return null;
  const target = reference.facts.find(fact => fact.maxAbiturGrade)?.maxAbiturGrade;
  return <details className="product-details official-reference">
    <summary>{reference.referenceYear ? `Offizielle Referenz · Eintritt ${reference.referenceYear}` : 'Aktuelle offizielle Hochschulregeln'}</summary>
    <div className="reference-content">
      <p className="field-help">{reference.note} Geprüft am {formatDate(reference.verifiedAt)}.</p>
      <dl>{reference.facts.map(fact => <div key={fact.kind}>
        <dt>{fact.label}</dt><dd>{fact.text}<a href={fact.sourceUrl} target="_blank" rel="noreferrer">Offizielle Quelle <ExternalLink size={13}/></a>{fact.supplementarySourceUrl && <a href={fact.supplementarySourceUrl} target="_blank" rel="noreferrer">Ergänzende Vorgabe <ExternalLink size={13}/></a>}</dd>
      </div>)}</dl>
      {target && onApplyAbiturTarget && <><Button variant="secondary" onClick={() => onApplyAbiturTarget({ grade: target, referenceOnly: true })}>Als persönliches Abiturziel · {target.toLocaleString('de-DE')}</Button><p className="field-help">Eine bewusste eigene Zielsetzung anhand der Referenz, keine bestätigte Zulassungsvorgabe für {goal.entryYear}.</p></>}
    </div>
  </details>;
}

export function ProviderReference({ data, test, today, onSelectDate }) {
  const reference = PROVIDER_REFERENCES[test];
  const dates = getPublishedProviderDates(test, today);
  // Published source snapshots are not inserted into personal records.
  const compared = rankCandidateTestDates({ ...data, testJourney: { ...data.testJourney, [test]: { ...data.testJourney?.[test], candidateDates: dates.map(item => ({ ...item, deadline: item.registration === 'late-only' ? item.lateDeadline : item.deadline })) } } }, test, today);
  return <details className="product-details official-reference">
    <summary>Geprüfte Anbieterinformationen{test === 'sat' ? ' & veröffentlichte Termine' : ''}</summary>
    <div className="reference-content"><p className="field-help">{reference.institution} · geprüft am {formatDate(reference.verifiedAt)}. Preise und Regeln vor einer Buchung erneut prüfen.</p>
      <dl>{reference.facts.map(fact => <div key={fact.label}><dt>{fact.label}{fact.status !== 'confirmed' && <small> · Noch offen</small>}</dt><dd>{fact.text}<a href={fact.url} target="_blank" rel="noreferrer">Offizielle Quelle <ExternalLink size={13}/></a></dd></div>)}</dl>
      {compared.length > 0 && <div className="reference-provider-dates" aria-label="Veröffentlichte Anbietertermine"><h3>Mit deinem Schulplan vergleichen</h3>{compared.map(item => {
        const published = dates.find(date => date.id === item.id);
        return <div className="reference-provider-date" key={item.id}><strong>{formatDate(item.date,{day:'numeric',month:'long',year:'numeric'})}</strong><p className="field-help">{published.registration === 'late-only' ? 'Nur verspätete Anmeldung, mit Aufpreis' : 'Reguläre Anmeldung'} bis {formatDate(item.deadline)}. Kein Platz bestätigt.</p><p>{item.reason}</p><Button variant="secondary" onClick={() => onSelectDate(item.date)}>Als Plantermin wählen</Button></div>;
      })}</div>}
    </div>
  </details>;
}
