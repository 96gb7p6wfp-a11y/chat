/** Official provider snapshots. Published dates do not establish local seats or a booking. */
export const PROVIDER_VERIFIED_AT = '2026-10-26';
const fact = (label, text, url, referenceYear = 2026, status = 'confirmed') => ({ label, text, url, verifiedAt: PROVIDER_VERIFIED_AT, referenceYear, status });
const satDatesURL = 'https://satsuite.collegeboard.org/sat/dates-deadlines';
const satFeesURL = 'https://satsuite.collegeboard.org/sat/registration/international-testing/fees';
const ieltsDatesURL = 'https://www.britishcouncil.de/en/exam/ielts/dates-fees-locations';
const date = (day, deadline, lateDeadline) => ({ id: `college-board-${day}`, date: day, deadline, lateDeadline, sourceUrl: satDatesURL, verifiedAt: PROVIDER_VERIFIED_AT, referenceYear: Number(day.slice(0,4)), status: 'confirmed', availability: 'not-checked' });

export const PROVIDER_REFERENCES = {
  sat: {
    institution: 'College Board', verifiedAt: PROVIDER_VERIFIED_AT,
    facts: [
      fact('Anmeldung', 'Melde dich mit deinem College-Board-Konto an. Das konkrete Testzentrum wählst du während der Anmeldung; suche zuerst im Raum Wiesbaden / Frankfurt. Hier ist kein Platz bestätigt.', 'https://satsuite.collegeboard.org/sat/registration'),
      fact('Kosten außerhalb der USA', 'Veröffentlichter Grundpreis: 68 USD plus 43 USD internationale Gebühr, zusammen 111 USD. Bestimmte Zentren und verspätete Anmeldung können zusätzliche Gebühren erheben. Preis vor Zahlung erneut prüfen; keine Euro-Umrechnung.', satFeesURL, 2027),
      fact('Fristen', 'Die veröffentlichten Fristen gelten für US- und internationale Teilnehmende und enden um 23:59 Uhr US Eastern Time. Nach der regulären Frist ist nur die gesondert ausgewiesene verspätete Anmeldung gegen Aufpreis möglich.', satDatesURL, 2027),
      fact('Ausweis', 'Ein gültiger physischer Lichtbildausweis ist erforderlich; Name und Foto müssen zur Anmeldung passen. Wer zum Test in ein anderes Land reist, benötigt nach der allgemeinen Regel einen gültigen Reisepass. Prüfe die vollständigen Standortregeln.', 'https://satsuite.collegeboard.org/sat/what-to-bring-do/id-requirements'),
      fact('Geeignetes Gerät', 'Bluebook läuft auf unterstützten Windows-/Mac-Geräten, iPads und schulverwalteten Chromebooks. Ein iPhone gehört nicht zu den genannten Prüfungsgeräten. Gerät voll laden, für 3–4 Stunden Betrieb vorbereiten und die aktuellen Anforderungen prüfen.', 'https://bluebook.collegeboard.org/students/download-bluebook'),
      fact('Gerät vorbereiten', 'Beginne mindestens 30 Tage vorher mit der Geräteprüfung. Wenn ein Leihgerät nötig ist, beantrage es bei College Board mindestens 30 Tage vor dem Test. Eine Bereitstellung wird hier nicht zugesichert.', 'https://bluebook.collegeboard.org/students/prepare-your-device'),
      fact('Belastbarer Ausgangswert', 'Nutze einen vollständigen ausgewerteten Bluebook-Probetest. Ein Test Preview ist unbenotet; die kurzen Originalaufgaben in dieser App erzeugen keinen offiziellen SAT-Score.', 'https://bluebook.collegeboard.org/students/practice'),
      fact('2028 noch vorläufig', 'College Board führt den Jahrgang 2027/28 als „Anticipated“ auf. Diese Daten werden hier nicht als bestätigte Anbietertermine übernommen.', satDatesURL, 2028, 'provisional'),
    ],
    dates: [
      date('2026-11-07', '2026-10-23', '2026-10-27'),
      date('2026-12-05', '2026-11-20', '2026-11-24'),
      date('2027-03-06', '2027-02-19', '2027-02-23'),
      date('2027-05-01', '2027-04-16', '2027-04-20'),
      date('2027-06-05', '2027-05-21', '2027-05-25'),
    ],
  },
  ielts: {
    institution: 'British Council Germany', verifiedAt: PROVIDER_VERIFIED_AT,
    facts: [
      fact('Orte in Deutschland', 'British Council nennt unter anderem Frankfurt, Heidelberg, Marburg, Köln, Düsseldorf, Berlin, Hamburg und München. Wähle den konkreten Ort und Termin im offiziellen Buchungssystem; freie Plätze sind hier nicht bestätigt.', ieltsDatesURL),
      fact('Buchen', 'Wähle IELTS Academic passend zu deinem Studienziel und prüfe den verlangten Testmodus. Die Buchung erfolgt beim Anbieter. British Council verlinkt sein Online-Buchungssystem für Deutschland.', 'https://www.britishcouncil.de/en/exam/ielts'),
      fact('Ausweis', 'British Council verlangt einen gültigen Personalausweis oder Reisepass. Der Ausweis muss sowohl bei der Buchung als auch am Prüfungstag gültig sein.', ieltsDatesURL),
      fact('Bezahlung', 'Die deutsche British-Council-Seite nennt Kredit-/Debitkarte, PayPal und Klarna. Prüfe im Buchungsschritt, welche Zahlungsart für deine Auswahl verfügbar ist.', ieltsDatesURL),
      fact('Ablauf', 'Listening, Reading und Writing finden am selben Tag ohne Pause dazwischen statt. Den Speaking-Zeitraum und die genaue Adresse bestätigt der Anbieter nach der Buchung.', ieltsDatesURL),
      fact('Kosten & konkrete Termine', 'Die abrufbare Übersichtsseite liefert keinen verlässlich lesbaren aktuellen Academic-Preis und keine konkreten buchbaren Termine. Prüfe beides im offiziellen Buchungssystem; hier wird kein Preis erfunden.', ieltsDatesURL, 2026, 'unverified'),
      fact('Weitere Anbieter', 'IDP Germany ist als offizieller Einstieg verlinkt. Die Seite war bei dieser Prüfung nicht abrufbar; Preise, Orte und Termine von IDP bleiben ungeprüft.', 'https://ielts.idp.com/germany', 2026, 'unverified'),
    ],
    dates: [],
  },
};

/** Date-only comparison is conservative: re-check exact US Eastern cutoff with provider. */
export function getPublishedProviderDates(test, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) return [];
  const parsed = new Date(`${today}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== today) return [];
  return (PROVIDER_REFERENCES[test]?.dates || []).filter(item => item.date >= today && item.lateDeadline >= today).map(item => ({ ...item, registration: item.deadline >= today ? 'regular' : 'late-only' }));
}
