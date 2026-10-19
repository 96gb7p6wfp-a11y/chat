/** Calendar-aware university milestones. Planned dates are preparation targets,
 * never invented university deadlines or evidence of an admission decision. */
const dayMs = 86_400_000;
const key = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
const calendar = value => new Date(`${value}T12:00:00Z`);
const shift = (value, days) => key(new Date(calendar(value).getTime() + days * dayMs));
const difference = (a, b) => Math.round((calendar(b) - calendar(a)) / dayMs);
const yearNumber = (value, fallback) => /^\d{4}$/.test(String(value)) && Number(value) >= 2020 && Number(value) <= 2198 ? Number(value) : fallback;
const step = (id, title, minutes, ...instructions) => ({ id, title, minutes, instructions });
const entry = (key, title, description, category, steps) => ({ key, title, description, category, steps });

function programme(state, pathway) {
  return state.universities.find(university => university.country === pathway && university.status !== 'applied') || state.universities.find(university => university.country === pathway);
}

function observedSetup(state, phaseKey, itemKey, actionKey) {
  const core = state.subjects.filter(subject => subject.enabled && /mathemat|physic|physik|english|englisch|german|deutsch/i.test(subject.name));
  const known = value => typeof value === 'number' && Number.isFinite(value);
  const languageKnown = value => Boolean(value && !/not sure|unknown|unsure/i.test(value));
  if (phaseKey === 'now' && itemKey === 'baseline') {
    if (actionKey === 'grades') return core.length > 0 && core.every(subject => known(subject.written) && known(subject.oral));
    if (actionKey === 'targets') return core.length > 0 && core.every(subject => known(subject.target) && subject.weakTopics.length > 0);
  }
  if (phaseKey === 'q1' && itemKey === 'english' && actionKey === 'baseline') return languageKnown(state.profile.englishLevel) && state.subjects.some(subject => /english|englisch/i.test(subject.name) && subject.weakTopics.length);
  if (phaseKey === 'q1' && ['language', 'german'].includes(itemKey) && actionKey === 'baseline') return languageKnown(state.profile.germanLevel) && state.subjects.some(subject => /german|deutsch/i.test(subject.name) && subject.weakTopics.length);
  if (phaseKey === 'q1' && ['routine', 'grades'].includes(itemKey) && actionKey === 'topic') return core.some(subject => subject.level === 'LK' && known(subject.written) && subject.weakTopics.length > 0);
  if (phaseKey === 'q1' && itemKey === 'activities') {
    const activity = state.activities.find(item => !item.impact) || state.activities[0];
    if (actionKey === 'role') return Boolean(activity?.responsibilities);
    if (actionKey === 'impact') return Boolean(activity?.achievements && activity?.impact);
    if (actionKey === 'hours') return Boolean(activity?.startDate && known(activity?.hoursPerWeek) && known(activity?.weeksPerYear));
  }
  return false;
}

function definitions(state, pathway) {
  const university = programme(state, pathway);
  const target = university?.name || (pathway === 'USA' ? 'eine US-Hochschule' : 'eine deutsche Hochschule');
  const fields = state.profile.targetFields.slice(0, 2).join(' / ') || 'ein passendes Studienfach';
  const activity = state.activities.find(item => !item.impact) || state.activities[0];
  const experience = activity?.name || 'Sport, Restaurantarbeit oder ein Projekt';
  const usa = pathway === 'USA';
  const common = {
    baseline: entry('baseline', usa ? 'Noten und Lernlücken erfassen' : 'Abiturfächer und Notenziele festhalten', 'Deine aktuellen Noten, Ziele und Lernlücken bestimmen deinen Tagesplan. Kurspunkte sind weder ein US-GPA noch deine endgültige Abiturnote.', 'grades', [
      step('grades', 'Schriftliche und mündliche Punkte deiner Kernfächer eintragen', 15, 'Trage unter Fächer deine tatsächlichen Ergebnisse in Mathematik, Physik, Englisch und Deutsch ein.', 'Lass unbekannte Ergebnisse offen. Rechne deine Punkte nicht pauschal in einen US-GPA um.'),
      step('targets', 'Je Fach eine Lernlücke und ein realistisches Ziel wählen', 15, 'Erfasse das Thema, bei dem du zuletzt Punkte verloren hast.', 'Wähle ein Ziel, das du mit deiner Lehrkraft besprechen kannst.'),
    ]),
    grades: entry('grades', 'Schriftlich in Mathematik und Physik besser werden', 'Übe deine schriftlichen LK-Schwächen mit konkretem Feedback. Neue Leistungsnachweise zeigen, ob sich deine Noten verbessern.', 'grades', [
      step('topic', 'Eine schriftliche LK-Schwäche für dieses Halbjahr auswählen', 15, 'Nutze dein jüngstes tatsächliches schriftliches Ergebnis und das Feedback deiner Lehrkraft.', 'Aktualisiere die Lernlücke und dein realistisches Ziel unter Fächer.'),
      step('feedback', 'Feedback zu einem eigenen LK-Lösungsversuch holen', 20, 'Zeige deinen eigenen Lösungsversuch und stelle eine genaue Frage.', 'Notiere, welche Methode du als Nächstes übst. Eine erledigte Aufgabe ist noch keine bessere Note.'),
    ]),
    german: entry('german', 'Deutsch: klarer schreiben und bessere Ergebnisse erzielen', 'Verbessere Argumentation, Ausdruck und Grammatik anhand echten Schulfeedbacks. Neue Leistungen zeigen deinen Fortschritt.', 'german', [
      step('baseline', 'Eine konkrete Schwäche beim Schreiben auf Deutsch erfassen', 10, 'Nutze das jüngste Feedback deiner Lehrkraft.', 'Aktualisiere deine Deutsch-Lernlücken und dein Sprachniveau.'),
      step('feedback', 'Feedback zu einem deutschen Argumentationsabsatz holen', 25, 'Nutze aktuelles Unterrichtsmaterial und die Bewertungskriterien.', 'Notiere eine konkrete Überarbeitung für die nächste Woche.'),
    ]),
    english: entry('english', 'Englisch: Schreiben und Klausurleistung verbessern', 'Verbessere Schreiben und Analyse mit Unterrichtsmaterial und einer ehrlichen Standortbestimmung. Das hilft deinen Noten und der Studienvorbereitung.', 'english', [
      step('baseline', 'Englischniveau und eine Schwäche beim Schreiben erfassen', 10, 'Erfasse dein Sprachniveau im Profil. Wenn du es noch nicht weißt, lass es offen.', 'Frage deine Englischlehrkraft, welche Schreibfertigkeit dich die meisten Punkte kostet.'),
      step('feedback', 'Feedback zu einem Analyseabsatz aus dem Unterricht holen', 25, 'Nutze eine aktuelle Schulaufgabe und die Kriterien deiner Lehrkraft.', 'Notiere eine konkrete Änderung, die du nächste Woche übst.'),
    ]),
    internship: entry(usa ? 'internship' : 'experience', usa ? 'Ein sinnvolles Praktikum oder Projekt planen' : 'Ein passendes Praktikum oder Projekt organisieren', 'Erkunde ein Studienfeld durch praktische Arbeit, löse ein echtes Problem und dokumentiere deinen eigenen Beitrag.', 'internships', [
      step('scope', `Ein kleines Projekt in ${fields} umreißen`, 20, 'Notiere das Problem, wem du damit hilfst und ein konkretes Ergebnis.', 'Wähle eine erste Version, die du in zwei bis vier Wochen schaffen kannst.'),
      step('contact', 'Einen Praktikumsbetrieb oder Projektmentor kontaktieren', 25, 'Finde eine echte Ansprechperson und bereite eine konkrete Anfrage vor.', 'Trage eine bestätigte Projekt- oder Praktikumsfrist unter Termine ein.'),
      step('evidence', 'Lernerfahrung und nachvollziehbaren eigenen Beitrag festhalten', 15, 'Erfasse die Erfahrung mit tatsächlichen Daten, deiner Verantwortung und vorhandenen Belegen im Profil.', 'Trage nur Ergebnisse ein, die tatsächlich entstanden sind.'),
    ]),
    documents: entry('documents', 'Bewerbungsunterlagen vorbereiten', 'Prüfe die aktuelle Checkliste jedes Studiengangs und fordere offizielle Schulunterlagen rechtzeitig an.', 'documents', [
      step('checklist', `Die offizielle Unterlagenliste für ${target} speichern`, 20, 'Prüfe Anforderungen an Notenübersicht, Abschlusszeugnis, Identitätsnachweis und Übersetzungen.', 'Speichere den offiziellen Link und fehlende Unterlagen in deinen Hochschulnotizen.'),
      step('request', 'Eine fehlende Schulunterlage anfordern', 20, 'Frage die Schule nach Ausstellung, Beglaubigung und möglichen Übersetzungen.', 'Notiere, wann die Unterlage vorliegt und wie die Hochschule sie akzeptiert.'),
    ]),
    transition: entry('transition', usa ? 'Den Studienstart vorbereiten' : 'Wohnen, Finanzierung und erstes Semester planen', 'Klär anhand offizieller Angaben Einschreibung, Finanzierung, Wohnen und einen realistischen Start ins erste Semester.', 'documents', [
      step('enrolment', 'Die Checkliste für Zusage und Einschreibung prüfen', 20, 'Nutze eine tatsächlich erhaltene Zusage und das offizielle Portal.', 'Notiere Annahmefrist und Bedingungen. Eine Zulassung bleibt bis zur echten Zusage offen.'),
      step('budget', 'Wohn- und Finanzierungsplan für das erste Semester erstellen', 25, 'Notiere bestätigte Gebühren, Lebenshaltungskosten und Finanzierungsquellen.', 'Prüfe bestätigte Wohnheim- und Einführungstermine.'),
    ]),
  };
  if (usa) return [
    ['now', 'Heute', [common.baseline, entry('list', 'Eine ausgewogene US-Hochschulliste beginnen', 'Verbinde ambitionierte und realistische Optionen mit offiziellen Anforderungen und einem tragfähigen Kostenplan.', 'research', [step('compare', `${target} mit einer weiteren US-Option vergleichen`, 20, `Lies die offizielle Studiengangseite für ${fields}.`, 'Notiere einen Grund für die Passung, eine Voraussetzung und eine offene Frage.'), step('balance', 'Eine realistische Alternative und eine Kostennotiz ergänzen', 20, 'Berücksichtige Studieninhalte, Zulassungsvoraussetzungen und vollständige Kosten.', 'Behalte Deutschland als parallele Option, wenn du diesen Weg gewählt hast.')])]],
    ['q1', 'Q1', [common.grades, common.english, common.german, entry('activities', 'Langfristiges Engagement dokumentieren', 'Dokumentiere Sport, Arbeit, Verantwortung und Projekte mit deiner eigenen Rolle, tatsächlichen Daten und nachvollziehbarem Beitrag.', 'extracurriculars', [step('role', activity ? `${experience}: deine Verantwortung festhalten` : 'Eine Aktivität wählen und die eigene Verantwortung festhalten', 15, 'Beschreibe unter Aktivitäten, was du persönlich machst.', 'Nenne konkrete Aufgaben statt nur einer allgemeinen Rollenbezeichnung.'), step('impact', activity ? `${experience}: ein echtes Ergebnis mit Beleg ergänzen` : 'Ein tatsächlich erreichtes Ergebnis mit Beleg festhalten', 20, 'Beschreibe, was sich durch deine Arbeit verändert hat und wann.', 'Nutze belegbare Zahlen oder ein konkretes Ergebnis. Unbekannte Zahlen bleiben offen.'), step('hours', 'Aktivitätsdaten und realistischen Zeitaufwand prüfen', 10, 'Erfasse tatsächlichen Beginn, gegebenenfalls Ende, Wochenstunden und Wochen pro Jahr.', 'Bewahre Notizen auf, die dir später beim Beschreiben der Erfahrung helfen.')]), entry('requirements', 'Internationale Zulassungsvoraussetzungen prüfen', 'Prüfe anerkannte Abschlüsse, Fachvoraussetzungen und Regeln für internationale Bewerbungen bei jedem Ziel.', 'documents', [step('qualification', `Prüfen, wie ${target} das deutsche Abitur anerkennt`, 20, 'Lies die offiziellen Regeln für internationale Bewerbungen.', 'Speichere geforderte Fächer und Unterlagen.'), step('english-policy', `Den geforderten Englischnachweis bei ${target} erfassen`, 15, 'Prüfe akzeptierte Qualifikationen, Tests und mögliche Befreiungen.', 'Notiere einen offiziellen Link und dein tatsächliches Prüfdatum.')])]],
    ['q2', 'Q2', [common.grades, entry('tests', 'Den passenden anerkannten Englischtest bestimmen', 'Prüfe IELTS-, TOEFL- und Cambridge-Regeln bei jedem Ziel. UC berücksichtigt SAT/ACT nicht für die Zulassung; andere Hochschulen prüfst du einzeln.', 'tests', [step('policy', 'Anerkannte Englischtests deiner Hochschulliste vergleichen', 20, 'Prüfe akzeptierte Tests, Mindestwerte, Befreiungen und Gültigkeit.', 'Prüfe zuerst die offiziellen Anforderungen und buche erst dann einen Test.'), step('decision', 'Einen nötigen Test und einen realistischen Zieltermin wählen', 15, 'Erstelle einen Testplan nur, wenn er für deine tatsächlichen Ziele sinnvoll ist.', 'Prüfe SAT/ACT-Regeln bei anderen Hochschulen einzeln. UC ist test-free.')]), common.internship, entry('finances', 'Studiengänge, Kosten und Finanzierung vergleichen', 'Erstelle neben Deutschland eine finanzierbare Hochschulliste. Förderung für internationale Studierende fällt unterschiedlich aus.', 'research', [step('cost', `Die vollständigen jährlichen Kosten für ${target} erfassen`, 20, 'Berücksichtige Studiengebühren, Lebenshaltung, Versicherung und Reisen.', 'Nutze offiziell veröffentlichte Zahlen und notiere die Quelle.'), step('funding', 'Eine überprüfte Finanzierungsmöglichkeit finden', 20, 'Prüfe, ob internationale Bewerbende förderberechtigt sind.', 'Notiere tatsächliche Fristen, Bedingungen und eine mögliche Finanzierungslücke.')])]],
    ['preparation', 'Studienvorbereitung', [entry('leadership', 'Verantwortung und Initiative durch Belege sichtbar machen', 'Übernimm dauerhaft echte Verantwortung bei Arbeit, Sport oder einem Projekt und dokumentiere deinen Beitrag.', 'extracurriculars', [step('contribution', `Eine sinnvolle Verbesserung bei ${experience} auswählen`, 25, 'Beschreibe das Problem und eine kleine Verbesserung, die du umsetzen kannst.', 'Notiere Verantwortung, nächsten Schritt und eine Möglichkeit, das Ergebnis zu prüfen.'), step('reflection', 'Ergebnis und Lernerfahrung festhalten', 15, 'Nutze echte Belege und beschreibe deinen eigenen Anteil.', 'Aktualisiere deine Aktivität. Noch offene Arbeit kannst du als laufend markieren.')])]],
    ['q3', 'Q3', [common.grades, entry('essays', 'Persönliche Bewerbungsantworten entwerfen', 'Schreibe über echte, konkrete Erfahrungen in deiner eigenen Sprache. UC und Common App verwenden unterschiedliche Fragen.', 'essays', [step('prompts', `Die aktuellen Bewerbungsfragen für ${target} speichern`, 15, 'Lies die offiziellen Bewerbungshinweise für deinen tatsächlichen Studienstart.', 'Notiere Wortgrenzen und wähle eine passende Frage.'), step('story', `Eine konkrete Erfahrung aus ${experience} gliedern`, 25, 'Beschreibe die Situation, dein Handeln, das Ergebnis und deine neue Erkenntnis.', 'Nutze konkrete Einzelheiten und deine eigene Ausdrucksweise.'), step('draft', 'Eine Bewerbungsantwort schreiben und Feedback einholen', 40, 'Schreibe anhand deiner Gliederung und beachte die tatsächliche Wortgrenze.', 'Bitte eine vertraute Person um Feedback. Inhalt und Formulierung bleiben deine eigenen.')]), entry('recommendations', 'Regeln für Empfehlungsschreiben prüfen', 'Bitte nur dort um Schreiben, wo sie gefordert sind. UC verlangt sie gewöhnlich nicht mit der ersten Bewerbung; prüfe jede Hochschule einzeln.', 'recommendations', [step('policy', 'Prüfen, welche Hochschulen Empfehlungsschreiben verlangen', 15, 'Notiere geforderte Anzahl, Art und Einreichungsweg.', 'Ein Lehrkraftschreiben ist keine pauschale UC-Bewerbungsvoraussetzung.'), step('request', 'Eine tatsächlich nötige Empfehlungsanfrage vorbereiten', 20, 'Frage früh mit bestätigter Frist und deiner eigenen Zusammenfassung deiner Aktivitäten an.', 'Notiere, wer zugesagt hat und ob das Schreiben eingereicht wurde.')]), entry('calendar', 'Fristen für deinen Studienstart bestätigen', 'US-Bewerbungen können vor deinem Abitur fällig sein. Bestätige dein Startjahr und speichere offizielle Hochschulfristen.', 'applications', [step('entry', 'Studienstart und Bewerbungsrunde bestätigen', 15, 'Kläre, ob du direkt nach dem Abitur oder nach einem Zwischenjahr starten möchtest.', 'Passe Bewerbungs- und Startjahr bei Bedarf im Profil an.'), step('deadlines', 'Bestätigte Fristen aller US-Ziele speichern', 20, 'Lies die offizielle Zulassungsseite für deine tatsächliche Bewerbungsrunde.', 'Erfasse echte Fristen bei Hochschulen oder Termine. Vorbereitungstermine sind keine offiziellen Bewerbungsfristen.')])]],
    ['q4', 'Q4', [entry('grades', 'Noten im Abschlussjahr stabilisieren', 'Übe fachbezogen weiter und prüfe Bedingungen tatsächlich erhaltener Zusagen.', 'grades', [step('weak-topics', 'Die wichtigste Lernlücke im Abschlussjahr auswählen', 20, 'Nutze aktuelles Leistungsfeedback und deinen nächsten Prüfungstermin.', 'Aktualisiere deine Fächer, damit Heute die passende Fertigkeit auswählt.'), step('conditions', 'Schulische Bedingungen echter Studienzusagen prüfen', 15, 'Nutze nur Zusagen, die du tatsächlich erhalten hast.', 'Notiere geforderte Abschlussunterlagen und mögliche Notenbedingungen.')]), common.documents]],
    ['abitur-preparation', 'Abiturvorbereitung', [entry('revision', 'Einen realistischen Abiturlernplan erstellen', 'Trage bestätigte Abiturprüfungen ein und priorisiere LK-Lücken. Erholung und feste Verpflichtungen behalten ihren Platz.', 'grades', [step('dates', 'Bestätigte Abiturtermine und Prüfungsthemen eintragen', 20, 'Nutze den von deiner Schule bestätigten Prüfungsplan.', 'Erfasse echte Prüfungen, damit Heute passende Vorbereitung einplant.'), step('review', 'Eine jüngste Klausur auswerten und Lernlücken aktualisieren', 30, 'Finde die Fehler, die dich die meisten Punkte gekostet haben.', 'Wähle eine Methode, die du vor dem nächsten Probedurchlauf verbesserst.')])]],
    ['abitur', 'Abitur', [entry('final', 'Abitur abschließen und Abschlussunterlagen ordnen', 'Ordne deine tatsächlichen Abschlussergebnisse und reiche sie auf dem offiziellen Weg jeder Hochschule ein.', 'grades', [step('results', 'Tatsächliche Abschlussergebnisse und Qualifikation erfassen', 15, 'Markiere den Abschluss erst nach Erhalt des offiziellen Zeugnisses als erreicht.', 'Halte die endgültige Abiturnote von einfachen Fachmittelwerten getrennt.'), step('send', 'Den Einreichungsweg für Abschlusszeugnisse prüfen', 20, 'Nutze den offiziell akzeptierten Einreichungsweg.', 'Notiere Einreichung und bestätigten Eingang.')])]],
    ['applications', 'Bewerbungen', [entry('submit', 'Bewerbungen einreichen und verfolgen', 'US-Bewerbungen können vor dem Abitur fällig sein. Richte dich nach deinem Startjahr und bestätigten Fristen.', 'applications', [step('audit', `Die Bewerbung für ${target} mit der offiziellen Checkliste abgleichen`, 25, 'Prüfe Studiengangwahl, Aktivitäten, Bewerbungsantworten und erforderliche Unterlagen.', 'Halte eine kurze Liste noch offener Anforderungen fest.'), step('submit', 'Einen offenen Bewerbungsabschnitt fertigstellen', 35, 'Nutze deine überprüften Angaben und das aktuelle Bewerbungsportal.', 'Reiche bewusst ein, wenn alles bereit ist, und hinterlege die Bestätigung bei der Hochschule.'), step('receipt', 'Bewerbungseingang und Portalnachrichten prüfen', 15, 'Nutze das offizielle Hochschulportal.', 'Erfasse noch offene Nachforderungen und ihre echten Fristen.')]), entry('decisions', 'Zusagen und praktische Voraussetzungen vergleichen', 'Prüfe echte Entscheidungen, Kosten, Bedingungen, Wohnen und Visavorgaben anhand offizieller Quellen.', 'applications', [step('offers', 'Tatsächlich erhaltene Zusagen vergleichen', 20, 'Berücksichtige Bedingungen, Kosten, Studieninhalte und Antwortfristen.', 'Lass Zusagen offen, bis eine offizielle Entscheidung vorliegt.'), step('decision', 'Eine begründete Wahl und die Annahmefrist festhalten', 20, 'Prüfe Finanzierung und offizielle Annahmebedingungen.', 'Markiere die Zulassung erst nach einer echten Zusage als erreicht.')])]],
    ['admission', 'Zulassung', [entry('offer', 'Eine Zulassung und ihre Bedingungen bestätigen', 'Erfasse tatsächliche offizielle Entscheidungen und Bedingungen. Erledigte Vorbereitung ist keine Zulassungsprognose.', 'applications', [step('portal', 'Offizielle Entscheidungen und offene Nachforderungen prüfen', 15, 'Nutze das offizielle Bewerbungsportal.', 'Erfasse die tatsächliche Entscheidung und beantworte echte Nachforderungen.'), step('acceptance', 'Finanzierung und Annahmebedingungen deiner gewählten Zusage prüfen', 20, 'Prüfe Antwortfrist, mögliche Anzahlung und Bedingungen.', 'Bestätige diesen Schritt erst nach einer echten Zulassungsentscheidung.')])]],
    ['university', 'Studium', [common.transition]],
  ];
  return [
    ['now', 'Heute', [common.baseline, entry('fields', 'Deutsche Studiengänge erkunden', 'Vergleiche Wirtschaftsinformatik, Informatik, Wirtschaft und Technik anhand tatsächlicher Studiengänge.', 'research', [step('compare', `Zwei deutsche Studiengänge in ${fields} vergleichen`, 20, 'Nutze Hochschulkompass und offizielle Studiengangseiten.', 'Notiere jeweils Studieninhalte, Ort und eine Zulassungsvoraussetzung.'), step('save', 'Eine deutsche Hochschule mit Studiengang speichern', 15, 'Notiere, warum der Studiengang zu deinen Interessen passt.', 'Speichere den offiziellen Studienganglink und offene Fragen.')])]],
    ['q1', 'Q1', [entry('routine', 'Eine regelmäßige LK-Lernroutine aufbauen', 'Gib schriftlichen Mathematik- und Physiklücken neben deinen anderen Fächern ausreichend Zeit.', 'grades', [step('topic', 'Ein schriftliches LK-Thema mit Verbesserungsbedarf auswählen', 15, 'Nutze tatsächliches schriftliches Feedback, nicht nur deine mündliche Note.', 'Aktualisiere Lernlücken und Ziele unter Fächer.'), step('teacher', 'Deine LK-Lehrkraft nach dem nächsten Verbesserungsschritt fragen', 15, 'Zeige einen eigenen Aufgabenversuch und benenne die konkrete Schwierigkeit.', 'Notiere das Feedback als nächsten Übungsschwerpunkt.')]), { ...common.german, key: 'language', title: 'Wissenschaftsnahes Schreiben auf Deutsch stärken' }, common.english]],
    ['q2', 'Q2', [common.grades, entry('programmes', 'Eine deutsche Hochschulauswahl erstellen', 'Vergleiche echte Studienangebote über Hochschulkompass und offizielle Studiengangseiten.', 'research', [step('shortlist', 'Drei passende deutsche Studiengänge speichern', 25, 'Vergleiche Module und schulische Voraussetzungen.', 'Nimm neben Wunschoptionen auch realistische Alternativen auf.'), step('fit', `Eine Frage zur Studiengangpassung bei ${target} notieren`, 15, 'Prüfe Pflichtmodule, Praxisanteile und Berufsmöglichkeiten.', 'Speichere die Frage und eine offizielle Ansprechstelle.')]), common.internship]],
    ['preparation', 'Studienvorbereitung', [entry('orientation', 'Das Studienfeld bewusst eingrenzen', 'Vergleiche Studieninhalte und nutze praktische Erfahrung, um deine Wahl sicherer zu treffen.', 'research', [step('compare', 'Module zweier möglicher Studienfelder vergleichen', 25, 'Wähle Studiengänge aus deinen gespeicherten Interessen.', 'Notiere interessante Module und Bereiche, für die du noch Vorbereitung brauchst.'), step('visit', 'Eine Beratung oder einen Hochschulbesuch planen', 15, 'Prüfe offizielle Hochschultage und Beratungstermine.', 'Erfasse einen bestätigten Termin unter Termine, sobald er vorliegt.')])]],
    ['q3', 'Q3', [common.grades, entry('admission', 'NC, Eignung und Bewerbungswege prüfen', 'NC-Werte ändern sich je Bewerbungsrunde und sind keine garantierten Grenzwerte. Prüfe jeden Studiengang einzeln.', 'applications', [step('requirements', `Die Studiengangvoraussetzungen bei ${target} prüfen`, 20, 'Notiere Zulassungsfreiheit, NC oder Eignungsverfahren und geforderte Voraussetzungen.', 'Nutze die aktuelle offizielle Studiengangseite statt eines vorhergesagten Grenzwerts.'), step('route', 'Den richtigen Bewerbungsweg deiner Hochschulliste erfassen', 15, 'Prüfe je Studiengang Hochschulportal, uni-assist oder Hochschulstart.', 'Speichere offiziellen Bewerbungsweg und Unterlagen je Studiengang.')]), entry('calendar', 'Fristen und Bewerbungsportale bestätigen', 'Nutze den vom Studiengang vorgegebenen Hochschulweg oder Hochschulstart.', 'applications', [step('cycle', 'Bewerbungssemester und Jahr bestätigen', 10, 'Prüfe Abschlussjahr und geplanten Studienstart.', 'Passe dein Profil an, wenn du ein Zwischenjahr planst.'), step('deadlines', 'Bestätigte deutsche Studiengangfristen speichern', 20, 'Prüfe studiengangbezogene Fristen und Ausnahmen.', 'Trage tatsächliche Termine bei Hochschulen oder Termine ein.')])]],
    ['q4', 'Q4', [entry('revision', 'Systematisch auf das Abitur vorbereiten', 'Übe fachbezogen und prüfe Fehler. Schlaf und feste Verpflichtungen behalten ihren Platz.', 'grades', [step('dates', 'Bestätigte Abiturtermine und Wiederholungsthemen eintragen', 20, 'Nutze den von deiner Schule bestätigten Prüfungsplan.', 'Erfasse tatsächliche Mathematik-, Physik- und weitere Prüfungen.'), step('errors', 'Die zwei wichtigsten Abiturlücken aktualisieren', 20, 'Nutze eine jüngste Klausur oder Feedback deiner Lehrkraft.', 'Heute wählt den nächsten konkreten Vorbereitungsschritt.')]), common.documents]],
    ['abitur-preparation', 'Abiturvorbereitung', [entry('readiness', 'Aus Lernlücken konkrete Abiturschwerpunkte machen', 'Echte Prüfungstermine und eigene Lösungsversuche lenken die Vorbereitung. Erledigte Aufgaben garantieren kein Ergebnis.', 'grades', [step('paper', 'Eine jüngste LK-Klausur auf verlorene Punkte prüfen', 30, 'Unterscheide Wissenslücken, Methodenfehler und Zeitprobleme.', 'Aktualisiere die passenden Lernlücken unter Fächer.'), step('plan', 'Den Prüfungs- und Erholungsplan der letzten zwei Wochen prüfen', 15, 'Prüfe echte Termine, freie Lernfenster und feste Verpflichtungen.', 'Plane direkt vor der Prüfung nur leichte Wiederholung.')])]],
    ['abitur', 'Abitur', [entry('complete', 'Abitur abschließen und Zeugnis erhalten', 'Prüfe deinen tatsächlichen Abschluss und studiengangbezogene Fachvoraussetzungen.', 'grades', [step('certificate', 'Angaben auf deinem offiziellen Abiturzeugnis prüfen', 15, 'Nutze das tatsächlich ausgestellte Zeugnis.', 'Halte den tatsächlichen Abschluss von Planungsmittelwerten getrennt.'), step('copies', 'Akzeptierte Zeugniskopien für Bewerbungen vorbereiten', 15, 'Prüfe den geforderten Upload- oder Beglaubigungsweg.', 'Notiere, bei welchen Studiengängen das Dokument eingegangen ist.')])]],
    ['applications', 'Bewerbungen', [entry('submit', 'Deutsche Bewerbungen einreichen', 'Richte dich nach bestätigten Studiengangfristen. Viele Fristen für das Wintersemester liegen im Sommer; es gibt Ausnahmen.', 'applications', [step('checklist', `Unterlagen und Bewerbungsportal für ${target} prüfen`, 20, 'Nutze den bestätigten Bewerbungsweg und die aktuelle Checkliste.', 'Notiere fehlende Unterlagen und die tatsächliche Frist.'), step('application', 'Einen offenen deutschen Bewerbungsabschnitt fertigstellen', 30, 'Nutze deinen tatsächlichen Abschluss und die gewählte Studiengangoption.', 'Hinterlege die Einreichungsbestätigung bei der Hochschule, sobald sie vorliegt.')]), entry('offers', 'Zusagen und Einschreibefristen verfolgen', 'Nimm Zusagen über das offizielle Portal an und schreibe dich dort ein. Beachte gegebenenfalls Hochschulstart-Koordinierungsregeln.', 'applications', [step('portal', 'Offiziellen Bewerbungsstatus und echte Zusagen prüfen', 15, 'Erfasse Entscheidungen und mögliche Nachforderungen von Unterlagen.', 'Erledigte Vorbereitung ist noch keine Studienplatzzusage.'), step('response', 'Annahme- und Einschreibefrist notieren', 15, 'Prüfe Koordinierungsregeln und Bedingungen.', 'Nimm eine Zusage bewusst im offiziellen Portal an.')])]],
    ['admission', 'Zulassung', [entry('offer', 'Zulassung und Einschreibungsvoraussetzungen bestätigen', 'Erfasse echte Zusagen, Abschlussbedingungen und offizielle Einschreibefristen.', 'applications', [step('decision', 'Die offizielle Zulassungsentscheidung erfassen', 15, 'Nutze deinen tatsächlichen Hochschul- oder Hochschulstartbescheid.', 'Noch unbekannte Entscheidungen bleiben offen.'), step('enrol', 'Die Einschreibecheckliste für deinen gewählten Platz prüfen', 20, 'Prüfe Unterlagen, Versicherung, Semesterbeitrag und Fristen.', 'Bestätige den Schritt erst nach einer tatsächlichen Entscheidung.')])]],
    ['university', 'Studium', [common.transition]],
  ];
}

export function getRoadmap(state, pathway = 'USA', date) {
  const path = pathway === 'Germany' ? 'Germany' : 'USA';
  const graduation = yearNumber(state.profile.graduationYear, Number(date.slice(0, 4)) + 2);
  const first = graduation - 2;
  const explicitEntry = yearNumber(state.profile.universityStartYear, null);
  const applicationYear = yearNumber(state.profile.applicationYear, null) ?? (explicitEntry ?? graduation) - (path === 'USA' ? 1 : 0);
  const entryYear = explicitEntry ?? applicationYear + (path === 'USA' ? 1 : 0);
  const periods = {
    now: [state.createdDate || date, shift(state.createdDate || date, 14)],
    q1: [`${first}-08-01`, `${first + 1}-01-31`], q2: [`${first + 1}-02-01`, `${first + 1}-07-31`],
    q3: [`${first + 1}-08-01`, `${graduation}-01-31`], q4: [`${graduation}-02-01`, `${graduation}-04-30`],
    preparation: [`${first + 1}-02-01`, `${path === 'USA' ? applicationYear : entryYear}-07-31`],
    'abitur-preparation': [`${graduation}-03-01`, `${graduation}-05-31`],
    abitur: [`${graduation}-05-01`, `${graduation}-07-31`],
    applications: path === 'USA' ? [`${applicationYear}-08-01`, `${applicationYear + 1}-07-31`] : [`${applicationYear}-05-01`, `${applicationYear}-09-30`],
    admission: path === 'USA' ? [`${entryYear}-03-01`, `${entryYear}-08-31`] : [`${entryYear}-08-01`, `${entryYear}-09-30`],
    university: [`${entryYear}-09-01`, `${entryYear + 1}-07-31`],
  };
  // An imported or incompletely edited entry cycle can be earlier than school
  // graduation. Keep every displayed preparation range valid while the user
  // finishes editing the cycle; never reverse a timeline interval.
  for (const period of Object.values(periods)) if (period[1] < period[0]) period[1] = period[0];
  const official = path === 'USA' ? 'https://admission.universityofcalifornia.edu/admission-requirements/international-applicants/' : 'https://www.hochschulkompass.de/en/degree-programmes.html';
  const confirmed = new Set(state.roadmapCompleted || []);
  const universities = state.universities.filter(item => item.country === path && item.status !== 'applied');
  // Official saved deadlines override preparation targets; no default deadline
  // is presented as verified. The selected application cycle remains explicit.
  const deadlines = universities.map(item => item.deadline).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= periods.applications[0] && value <= periods.applications[1]).sort();
  const phases = definitions(state, path).map(([phaseKey, label, entries]) => {
    const [start, end] = periods[phaseKey];
    const items = entries.map(definition => {
      const id = `${path}-${phaseKey}-${definition.key}`;
      const steps = definition.steps.map(action => {
        const actionId = `${id}-${action.id}`;
        const recorded = observedSetup(state, phaseKey, definition.key, action.id);
        const taskMinutes = state.tasks.filter(task => task.completed && task.roadmapItemId === id && task.roadmapStepId === actionId).reduce((sum, task) => sum + task.minutes, 0);
        const minutes = recorded ? Math.max(action.minutes, taskMinutes) : taskMinutes;
        return { ...action, id: actionId, completed: recorded || minutes >= action.minutes, completedFromData: recorded, completedMinutes: minutes, remainingMinutes: Math.max(0, action.minutes - minutes) };
      });
      const completedSteps = steps.filter(action => action.completed).length;
      const nextStep = confirmed.has(id) ? null : steps.find(action => !action.completed) || null;
      const isSubmission = phaseKey === 'applications' && definition.key === 'submit';
      return { id, title: definition.title, description: definition.description, category: definition.category, completed: confirmed.has(id), confirmed: confirmed.has(id),
        pathway: path, phaseId: `${path}-${phaseKey}`, goalId: goalForCategory(definition.category), planningStart: start,
        dueDate: isSubmission && deadlines[0] ? deadlines[0] : end, dateVerified: Boolean(isSubmission && deadlines[0]),
        completedSteps, totalSteps: steps.length, actionProgress: Math.round(steps.reduce((sum, action) => sum + Math.min(action.minutes, action.completedMinutes), 0) / Math.max(1, steps.reduce((sum, action) => sum + action.minutes, 0)) * 100), steps, nextStep,
        link: path === 'Germany' && definition.key === 'calendar' ? 'https://www.hochschulstart.de/' : programme(state, path)?.url || official,
      };
    });
    const dateStatus = date < start ? 'upcoming' : date > end ? 'past' : 'current';
    return { id: `${path}-${phaseKey}`, key: phaseKey, label, start, end, status: items.every(item => item.completed) ? 'complete' : dateStatus, items };
  });
  return phases.sort((a, b) => a.key === 'now' ? -1 : b.key === 'now' ? 1 : a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

export function goalForCategory(category) {
  return ({ grades: 'grades', english: 'language', german: 'language', extracurriculars: 'activities', internships: 'activities', research: 'research', tests: 'tests', essays: 'applications', recommendations: 'applications', documents: 'applications', applications: 'applications' })[category] || 'research';
}
export function taskCategoryForMilestone(item) {
  return item.category === 'grades' ? 'academics' : ['english', 'german'].includes(item.category) ? 'language' : ['extracurriculars', 'internships'].includes(item.category) ? 'activity' : 'university';
}

/** The next achievable actions, filtered by the selected pathways and phase. */
export function getRoadmapPriorities(state, date) {
  const result = [];
  for (const path of state.profile.pathways || []) for (const phase of getRoadmap(state, path, date)) {
    const ahead = difference(date, phase.start);
    const declaredSemester = /^q[1-4]$/.test(phase.key) && phase.label === state.profile.schoolYear;
    if (ahead > 30 && !declaredSemester) continue;
    if (state.profile.schoolYear === 'Graduated' && ['q1', 'q2', 'q3', 'q4', 'abitur', 'abitur-preparation'].includes(phase.key) && phase.items.every(item => item.category === 'grades')) continue;
    // Offer and transition actions need the actual decision season. They do
    // not become generic first-year tasks just because a profile says Graduated.
    if (['admission', 'university'].includes(phase.key) && date < phase.start) continue;
    for (const item of phase.items) {
      if (item.completed || !item.nextStep) continue;
      if (state.profile.schoolYear === 'Graduated' && item.category === 'grades') continue;
      const dueIn = difference(date, item.dueDate);
      const score = item.dateVerified && dueIn >= 0 && dueIn <= 7 ? 174 : item.dateVerified && dueIn >= 0 && dueIn <= 21 ? 109
        : declaredSemester && ahead > 30 ? 58 : phase.key === 'now' ? 56 : phase.status === 'current' ? 55 : phase.status === 'past' ? 45 : 39;
      result.push({ ...item, phaseLabel: phase.label, score: score + (item.category === 'extracurriculars' ? 1 : 0), daysUntil: dueIn, category: taskCategoryForMilestone(item), milestoneCategory: item.category });
    }
  }
  return result.sort((a, b) => b.score - a.score || a.dueDate.localeCompare(b.dueDate) || state.profile.pathways.indexOf(a.pathway) - state.profile.pathways.indexOf(b.pathway) || a.id.localeCompare(b.id));
}
