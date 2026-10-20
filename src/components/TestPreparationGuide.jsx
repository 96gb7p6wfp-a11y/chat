import React from 'react';
import { ArrowUpRight } from 'lucide-react';

const Link = ({ href, children }) => <a className="preparation-resource" href={href} target="_blank" rel="noreferrer"><span>{children}</span><ArrowUpRight size={15} aria-hidden="true" /></a>;

export default function TestPreparationGuide({ test = 'IELTS' }) {
  const sat = test === 'SAT';
  return <details className="product-details preparation-guide"><summary>Anmeldung & offizielle Informationen</summary><div className="stack compact">
    <p className="small muted">{sat ? 'Prüfe zuerst, ob der SAT für deine tatsächliche Hochschulliste sinnvoll ist. Eine Anmeldung bleibt eine eigene Entscheidung.' : 'Wähle IELTS Academic passend zu den Anforderungen deiner Hochschulen. Academic, General Training und UKVI sind unterschiedliche Angebote.'}</p>
    {sat ? <>
      <Link href="https://satsuite.collegeboard.org/sat/registration">College Board · Registrierung</Link>
      <Link href="https://satsuite.collegeboard.org/sat/dates-deadlines">Offizielle Termine & Anmeldefristen</Link>
      <Link href="https://satsuite.collegeboard.org/sat/registration/international-testing">Internationale Anmeldung & Gebühren</Link>
      <Link href="https://satsuite.collegeboard.org/practice/practice-tests/bluebook">Bluebook · vollständige Probetests</Link>
      <Link href="https://satsuite.collegeboard.org/practice/student-question-bank">Student Question Bank · Aufgaben & Erklärungen</Link>
      <ol className="preparation-checklist"><li>Prüfe die SAT-Regel jeder Hochschule auf ihrer offiziellen Zulassungsseite.</li><li>Wähle im College-Board-Konto einen angebotenen Termin und ein Testzentrum. Ein hier geplanter Termin reserviert keinen Platz.</li><li>Prüfe die aktuelle Anmeldefrist, Gesamtgebühr einschließlich möglicher internationaler Gebühren und die Stornobedingungen.</li><li>Prüfe die aktuellen Ausweis-, Foto- und Geräteanforderungen. Bereite Bluebook und das zugelassene Testgerät rechtzeitig vor.</li></ol>
      <p className="small">UCLA und UC Berkeley gehören zum UC-System, das SAT/ACT-Ergebnisse nicht für die Zulassungsentscheidung berücksichtigt. Ein SAT kann für andere Hochschulen relevant sein. Prüfe die Regel für deinen Bewerbungsjahrgang direkt bei der UC.</p>
      <Link href="https://admission.universityofcalifornia.edu/admission-requirements/freshman-requirements/">UC · offizielle Zulassungsvoraussetzungen</Link>
    </> : <>
      <Link href="https://www.britishcouncil.de/en/exam/ielts">British Council Deutschland · IELTS</Link>
      <Link href="https://www.britishcouncil.de/en/exam/ielts/dates-fees-locations">British Council · Termine, Orte & Gebühren</Link>
      <Link href="https://ielts.idp.com/germany">IDP Deutschland · IELTS-Angebot</Link>
      <Link href="https://ielts.org/take-a-test/preparation-resources/sample-test-questions/academic-test">IELTS · offizielle Academic-Beispielaufgaben</Link>
      <ol className="preparation-checklist"><li>Prüfe das erforderliche Overall Band und mögliche Mindestwerte pro Bereich auf der offiziellen Hochschulseite.</li><li>Vergleiche beim Anbieter angebotene Orte, Formate und Termine. Berücksichtige deine Schulklausuren und einen möglichen zweiten Versuch.</li><li>Prüfe die aktuelle Gesamtgebühr und Umbuchungsbedingungen direkt im Buchungsangebot.</li><li>Prüfe die für deinen Test zugelassenen Ausweisdokumente. Name und Dokumentdaten müssen zur Anmeldung passen; kläre auch den Termin des Speaking-Teils.</li></ol>
    </>}
    <p className="field-help">Aktuelle Preise, freie Plätze, Fristen und Dokumentregeln sind hier nicht live verifiziert. Maßgeblich ist das offizielle Angebot bei der Buchung. Die App übernimmt keine Buchung und zeigt deshalb keine unbestätigten Preise oder verfügbaren Prüfungstermine.</p>
  </div></details>;
}
