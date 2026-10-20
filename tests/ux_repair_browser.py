"""Real UI journeys for the Q1 document import and coordinated test coach.

Run after building and serving the app:
  python3 tests/ux_repair_browser.py --url http://127.0.0.1:4181

All interactions run in isolated browser storage. Assessment dates, weights,
mock scores and activity evidence below are explicit QA scenarios, not user data.
Chromium emulation cannot verify the real iOS keyboard or native date picker.
"""
import argparse
import copy
import json
from pathlib import Path
import re
import time
import traceback

from playwright.sync_api import sync_playwright, expect
from coach_upgrade_browser import Suite, TODAY, state, wait_state, navigate, close_dialog, expand, no_overflow, today_tasks

RESULTS = Path(__file__).resolve().parents[1] / 'test-results' / 'ux-repair'
EXAMS = {
    'english': '2026-10-26', 'computer-science': '2026-11-12',
    'politics': '2026-11-13', 'history': '2026-11-20',
    'religion': '2026-11-25', 'physics': '2026-12-07',
    'german': '2026-12-09', 'art': '2026-12-16',
    'mathematics': '2026-12-17',
}


class RepairSuite(Suite):
    def __init__(self, browser, url):
        super().__init__(browser, url)
        self.imported = None
        self.with_tests = None

    def shot(self, page, name):
        # A full-page screenshot would place a viewport-fixed dialog over the
        # entire background document, which is not what a phone user sees.
        page.screenshot(path=str(RESULTS / f'{name}.png'),
            full_page=not page.get_by_role('dialog').count(), animations='disabled')

    def open_documents(self, page):
        navigate(page, 'Profil')
        page.get_by_role('tab', name='Überblick', exact=True).click()
        page.get_by_role('button', name=re.compile('Q1-Unterlagen')).click()
        expect(page.get_by_role('dialog', name='Deine Q1-Unterlagen')).to_be_visible()

    def school_documents_are_reviewed_and_idempotent(self):
        page = self.personal_page(dark=True)
        self.open_documents(page)
        assert state(page)['exams'] == [] and state(page)['schedule']['lessons'] == []
        page.get_by_role('button', name=re.compile('9 bestätigte Klausuren')).click()
        dialog = page.get_by_role('dialog', name='Bestätigte Klausuren')
        expect(dialog.get_by_role('button', name='9 Klausuren übernehmen', exact=True)).to_be_disabled()
        assert dialog.locator('.school-import-record').count() == 9
        dialog.get_by_label('Diese ausgewählten Termine entsprechen meiner bestätigten Liste.', exact=True).check()
        dialog.get_by_role('button', name='9 Klausuren übernehmen', exact=True).click()
        wait_state(page, 'data.exams.length === 9')
        actual = state(page)['exams']
        assert {exam['subjectId']: exam['date'] for exam in actual} == EXAMS
        assert all(exam['time'] == '' and not exam.get('room') and exam['topics'] == [] for exam in actual)
        page.get_by_role('button', name=re.compile('9 bestätigte Klausuren')).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Diese ausgewählten Termine entsprechen meiner bestätigten Liste.', exact=True).check()
        dialog.get_by_role('button', name='Abgleich bestätigen', exact=True).click()
        assert len(state(page)['exams']) == 9
        page.get_by_role('button', name=re.compile('Deinen Stundenplan prüfen')).click()
        dialog = page.get_by_role('dialog', name='Stundenplan prüfen')
        assert dialog.locator('.school-import-record').count() == 19
        assert state(page)['schedule']['lessons'] == []
        expect(dialog.get_by_role('button', name='19 Blöcke übernehmen', exact=True)).to_be_disabled()
        first = dialog.locator('.school-import-record').first
        first.locator('summary').click()
        expect(first.get_by_label('Kursbezeichnung', exact=True)).to_have_value('PH-LK-1')
        expect(first.get_by_label('Raum · optional', exact=True)).to_have_value('PHL')
        first.get_by_label('Raum · optional', exact=True).fill('PHL')
        no_overflow(page)
        self.shot(page, '02-timetable-review')
        dialog.get_by_label('Ich habe die ausgewählten Stunden geprüft. Sie gelten als mein aktueller Wochenplan, bis ich sie ändere.', exact=True).check()
        dialog.get_by_role('button', name='19 Blöcke übernehmen', exact=True).click()
        wait_state(page, 'data.schedule.lessons.length === 19')
        lessons = state(page)['schedule']['lessons']
        assert len({lesson['id'] for lesson in lessons}) == 19
        monday_physics = next(item for item in lessons if item['day'] == 1 and item['subjectId'] == 'physics')
        assert (monday_physics['start'], monday_physics['end'], monday_physics['periodStart'], monday_physics['periodEnd'], monday_physics['teacher'], monday_physics['room']) == ('09:55', '11:30', 3, 4, 'NiG', 'PHL')
        tuesday_sport = next(item for item in lessons if item['day'] == 2 and item['subjectId'] == 'sport')
        assert tuesday_sport['room'] == '' and tuesday_sport['courseType'] == 'PF'
        wednesday_english = next(item for item in lessons if item['day'] == 3 and item['subjectId'] == 'english')
        assert (wednesday_english['start'], wednesday_english['end']) == ('11:45', '13:10')
        friday_sport = next(item for item in lessons if item['day'] == 5 and item['subjectId'] == 'sport')
        assert (friday_sport['start'], friday_sport['end'], friday_sport['room']) == ('15:00', '16:30', 'TMBG')
        page.get_by_role('button', name=re.compile('Deinen Stundenplan prüfen')).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Ich habe die ausgewählten Stunden geprüft. Sie gelten als mein aktueller Wochenplan, bis ich sie ändere.', exact=True).check()
        dialog.get_by_role('button', name='Abgleich bestätigen', exact=True).click()
        assert len(state(page)['schedule']['lessons']) == 19
        close_dialog(page)
        navigate(page, 'Heute')
        expect(page.get_by_role('region', name='Nächste Termine')).to_contain_text('Englisch')
        expect(page.get_by_role('region', name='Nächste Termine')).to_contain_text('In 7 Tagen')
        assert any(task.get('examId') == 'q1-hessen-2026-exam-english' for task in today_tasks(page))
        assert page.locator('.daily-tasks').first.locator('.coach-task').count() <= 3
        self.imported = state(page)
        self.shot(page, '03-today-dark')
        no_overflow(page)

    def german_draft_requires_confirmation_and_forecast_assumptions(self):
        assert self.imported
        page = self.page(seed=self.imported)
        self.open_documents(page)
        page.get_by_role('button', name=re.compile('Deutsch · 4 von 15 Punkten')).click()
        dialog = page.get_by_role('dialog', name='Deutsch-Ergebnis ergänzen')
        for label in ['Tatsächliche Leistungsart', 'Tatsächliches Datum', 'Relatives Gewicht dieser Leistung']:
            expect(dialog.get_by_label(label, exact=True)).to_have_value('')
        dialog.get_by_role('button', name='Ergebnis bestätigen', exact=True).click()
        assert state(page)['grades'] == []
        # Explicit isolated assessment metadata; no real assessment date is inferred.
        dialog.get_by_label('Tatsächliche Leistungsart', exact=True).select_option('written')
        dialog.get_by_label('Tatsächliches Datum', exact=True).fill('2026-10-16')
        dialog.get_by_label('Relatives Gewicht dieser Leistung', exact=True).fill('1')
        dialog.get_by_label('Thema / Feedback · optional', exact=True).fill('QA-Szenario: Analyse und Textbelege.')
        dialog.get_by_label('Art, Datum und Gewicht sind richtig. Ich habe die geltende Berechnungsregel geprüft.', exact=True).check()
        dialog.get_by_role('button', name='Ergebnis bestätigen', exact=True).click()
        wait_state(page, 'data.grades.length === 1')
        assert state(page)['grades'][0]['points'] == 4
        assert not page.get_by_role('button', name=re.compile('Deutsch · 4 von 15 Punkten')).count()
        close_dialog(page)
        navigate(page, 'Fortschritt')
        page.get_by_role('button', name='Deutsch: Noten und Ziel berechnen', exact=True).click()
        page.get_by_role('button', name='Noten und Ziele für Deutsch einstellen', exact=True).click()
        page.get_by_label('Mein Fachziel · Punkte', exact=True).fill('10')
        page.get_by_label('Berechnung', exact=True).select_option('weighted')
        page.get_by_role('button', name='Einstellungen speichern', exact=True).click()
        dialog = page.get_by_role('dialog', name='Deutsch', exact=True)
        expect(dialog).to_contain_text('Letztes Ergebnis')
        expect(dialog).to_contain_text('Keine bestätigte Kursnote')
        expand(dialog, 'Zielnote berechnen')
        expect(dialog.locator('.forecast-result')).to_contain_text('Wie viele Leistungen')
        dialog.get_by_label('Offene Leistungen', exact=True).select_option('1')
        expect(dialog.locator('.forecast-result')).to_contain_text(re.compile('gewicht', re.I))
        dialog.get_by_label('Gewicht jeder offenen Leistung', exact=True).fill('2')
        expect(dialog.locator('.forecast-result')).to_contain_text('mindestens 13 Punkte')
        dialog.get_by_label('Gewicht jeder offenen Leistung', exact=True).fill('1')
        expect(dialog.locator('.forecast-result')).to_contain_text('SO NICHT ERREICHBAR')
        expect(dialog.locator('.forecast-result')).to_contain_text('15')
        dialog.get_by_label('Offene Leistungen', exact=True).select_option('2')
        expect(dialog.locator('.forecast-result')).to_contain_text('mindestens 13 Punkte')
        no_overflow(page)
        dialog.locator('.forecast-result').scroll_into_view_if_needed()
        self.shot(page, '04-grade-analysis')
        close_dialog(page)
        navigate(page, 'Heute')
        expect(page.get_by_role('region', name='Deine heutige Mission')).to_contain_text('Englisch')
        expect(page.get_by_role('region', name='Deine größte Lernchance')).to_contain_text('Deutsch')
        expect(page.get_by_role('region', name='Deine größte Lernchance')).to_contain_text('LANGFRISTIG VERBESSERN')
        self.shot(page, '04b-urgent-english-long-term-german')
        # Corrections are personal evidence: reopening the original import draft
        # must never offer to replace an edited 6-point assessment with its old 4.
        navigate(page, 'Fortschritt')
        page.get_by_role('button', name='Deutsch: Noten und Ziel berechnen', exact=True).click()
        page.get_by_role('button', name='Note 4 vom 2026-10-16 bearbeiten', exact=True).click()
        page.get_by_label('Punkte (0–15)', exact=True).fill('6')
        page.get_by_role('button', name='Note speichern', exact=True).click()
        wait_state(page, 'data.grades.length === 1 && data.grades[0].points === 6')
        close_dialog(page)
        self.open_documents(page)
        assert not page.get_by_role('button', name=re.compile('Deutsch · 4 von 15 Punkten')).count()
        expect(page.get_by_role('dialog')).to_contain_text('späteren Korrekturen bleiben erhalten')
        assert state(page)['grades'][0]['points'] == 6


    def full_journey_completion_skip_activity_and_review(self):
        assert self.imported
        page = self.page(seed=self.imported)
        original = today_tasks(page)
        complete = original[0]
        page.get_by_role('button', name=f'Aufgabe abschließen: {complete["title"]}', exact=True).click()
        wait_state(page, f'data.tasks.some(task => task.id === {json.dumps(complete["id"])} && task.completed)')
        navigate(page, 'Fortschritt')
        expect(page.locator('body')).to_contain_text('1 /')
        navigate(page, 'Heute')
        pending = next(item for item in today_tasks(page) if not item['completed'])
        self.open_task(page, pending)
        expand(page.get_by_role('dialog'), 'Ergebnis & Wiederholung')
        page.get_by_label('Deine Antwort oder dein Lösungsweg', exact=True).fill('QA-Entwurf bleibt nach dem Auslassen erhalten.')
        expand(page.get_by_role('dialog'), 'Aufgabe anpassen')
        page.get_by_role('button', name='Heute auslassen', exact=True).click()
        wait_state(page, f'data.tasks.some(task => task.id === {json.dumps(pending["id"])} && task.skipped)')
        assert 'QA-Entwurf' in next(item for item in state(page)['tasks'] if item['id'] == pending['id'])['notes']
        assert len(today_tasks(page)) <= 5
        assert sum(item['minutes'] for item in today_tasks(page)) <= 120
        navigate(page, 'Profil')
        page.get_by_role('tab', name='Erfahrungen', exact=True).click()
        page.get_by_role('button', name='Hinzufügen', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Name der Erfahrung', exact=True).fill('Codingprojekt · UX-QA')
        dialog.get_by_label('Was ich mache', exact=True).fill('Isolierter Testeintrag ohne behauptete Erfolge.')
        dialog.get_by_label('Meine Verantwortung', exact=True).fill('Entwicklung und Dokumentation.')
        dialog.get_by_role('button', name='Erfahrung speichern', exact=True).click()
        wait_state(page, 'data.activities.some(item => item.name === "Codingprojekt · UX-QA")')
        expect(page.get_by_text('Codingprojekt · UX-QA', exact=True)).to_be_visible()
        self.shot(page, '05-profile-activities')
        navigate(page, 'Fortschritt')
        page.get_by_role('button', name='Woche reflektieren', exact=True).click()
        page.get_by_label('Was hat funktioniert? Was möchtest du ändern?', exact=True).fill('QA: Englische Klausur priorisieren und Deutsch langfristig beibehalten.')
        page.get_by_label('Schwerpunkt für die nächste Woche', exact=True).select_option('german')
        page.get_by_label('Lernumfang nächste Woche', exact=True).select_option('lighter')
        page.get_by_role('button', name='Speichern und nächste Woche anpassen', exact=True).click()
        wait_state(page, 'data.weeklyReviews.length === 1')
        expect(page.locator('.weekly-review-card')).to_contain_text('QA:')
        assert page.locator('.next-week-priorities li').count() > 0
        page.reload(wait_until='networkidle')
        assert len(state(page)['exams']) == 9 and len(state(page)['schedule']['lessons']) == 19
        assert state(page)['weeklyReviews'][0]['focusSubjectId'] == 'german'

    def corrected_import_records_survive_reimport(self):
        assert self.imported
        page = self.page(seed=self.imported)
        navigate(page, 'Lernplan')
        page.get_by_role('button', name='Prüfungen', exact=True).click()
        page.get_by_role('button', name='Englisch · Q1-Klausur bearbeiten', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Prüfungsdatum', exact=True).fill('2026-10-27')
        dialog.get_by_label('Prüfungsthemen', exact=True).fill('QA-Szenario: Zusammenfassung\nQA-Szenario: Analyse')
        dialog.get_by_role('button', name='Prüfung speichern', exact=True).click()
        wait_state(page, 'data.exams.some(exam => exam.subjectId === "english" && exam.date === "2026-10-27")')
        page.get_by_role('button', name='Stundenplan', exact=True).click()
        page.locator('.lesson-day .lesson-row').first.get_by_role('button', name=re.compile('bearbeiten')).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Raum · optional', exact=True).fill('QA-Raum')
        dialog.get_by_role('button', name='Stunde speichern', exact=True).click()
        wait_state(page, 'data.schedule.lessons.some(lesson => lesson.room === "QA-Raum")')
        self.open_documents(page)
        page.get_by_role('button', name=re.compile('9 bestätigte Klausuren')).click()
        dialog = page.get_by_role('dialog')
        expect(dialog).to_contain_text('27.')
        dialog.get_by_label('Diese ausgewählten Termine entsprechen meiner bestätigten Liste.', exact=True).check()
        dialog.get_by_role('button', name='Abgleich bestätigen', exact=True).click()
        page.get_by_role('button', name=re.compile('Deinen Stundenplan prüfen')).click()
        dialog = page.get_by_role('dialog')
        expect(dialog).to_contain_text('QA-Raum')
        dialog.get_by_label('Ich habe die ausgewählten Stunden geprüft. Sie gelten als mein aktueller Wochenplan, bis ich sie ändere.', exact=True).check()
        dialog.get_by_role('button', name='Abgleich bestätigen', exact=True).click()
        current = state(page)
        assert len(current['exams']) == 9 and len(current['schedule']['lessons']) == 19
        english = next(exam for exam in current['exams'] if exam['subjectId'] == 'english')
        assert english['date'] == '2026-10-27' and len(english['topics']) == 2
        assert any(lesson['room'] == 'QA-Raum' for lesson in current['schedule']['lessons'])

    def open_task(self, page, task):
        button = page.get_by_role('button', name=f'Lernaufgabe öffnen: {task["title"]}', exact=True)
        if not button.is_visible():
            expand(page.locator('.further-tasks'), 'Weitere geplante Schritte')
        button.click()

    def imported_timetable_and_exam_overview(self):
        assert self.imported
        page = self.page(seed=self.imported, dark=True)
        navigate(page, 'Lernplan')
        no_overflow(page)
        self.shot(page, '06a-week-plan')
        page.get_by_role('button', name='Stundenplan', exact=True).click()
        expect(page.locator('.timetable-view')).to_contain_text('PH-LK-1')
        expect(page.locator('.timetable-view')).to_contain_text('M124')
        self.shot(page, '06-timetable-day')
        page.get_by_role('group', name='Stundenplan-Ansicht').get_by_role('button', name='Woche', exact=True).click()
        assert page.locator('.timetable-week .lesson-row').count() == 19
        no_overflow(page)
        self.shot(page, '07-timetable-week')
        page.get_by_role('button', name='Prüfungen', exact=True).click()
        assert page.locator('.exam-card').count() == 9
        first = page.locator('.exam-card').first
        expect(first).to_contain_text('26.')
        expand(first, 'Vorbereitungsplan')
        assert first.locator('.revision-stage').count() >= 3
        # No invented exam topics or preparation-proficiency claims.
        expect(first).to_contain_text(re.compile('Themen|vorläufig'))
        no_overflow(page)
        self.shot(page, '08-exams-preparation')
        # Put the study window across actual imported lessons through the editor.
        # This tests blocking, rather than an already non-overlapping evening.
        page.get_by_role('button', name='Lernzeiten', exact=True).click()
        page.get_by_label('Montag Lernminuten', exact=True).fill('180')
        page.get_by_label('Montag Lernbeginn', exact=True).fill('08:00')
        page.get_by_label('Montag Lernende', exact=True).fill('17:00')
        page.get_by_role('button', name='Lernzeiten speichern', exact=True).click()
        wait_state(page, 'data.schedule.weekly.some(day => day.day === 1 && day.windowStart === "08:00")')
        navigate(page, 'Heute')
        sessions = [session for task in today_tasks(page) for session in task.get('sessions', [])]
        assert sessions, 'Generated tasks need real sessions in the study window.'
        assert sum(task['minutes'] for task in today_tasks(page)) <= 180
        for session in sessions:
            assert session['start'] >= '08:00' and session['end'] <= '17:00'
            for lesson in state(page)['schedule']['lessons']:
                if lesson['day'] == 1:
                    assert session['end'] <= lesson['start'] or session['start'] >= lesson['end'], (session, lesson)

    def coordinated_ielts_sat_setup_results_and_backup(self):
        assert self.imported
        page = self.page(seed=self.imported, width=320, dark=True)
        navigate(page, 'Profil')
        page.get_by_role('tab', name='IELTS & SAT', exact=True).click()
        page.get_by_role('button', name='Ziel festlegen', exact=True).click()
        dialog = page.get_by_role('dialog', name='Dein IELTS-Ziel')
        dialog.get_by_label('Prüfungsdatum (optional)', exact=True).fill('2027-01-23')
        dialog.get_by_label('Ziel · Overall Band', exact=True).fill('7')
        for skill in ['Listening', 'Reading', 'Writing', 'Speaking']:
            dialog.get_by_label(f'{skill} · Ziel', exact=True).fill('7')
        dialog.get_by_label('IELTS-Zeit pro Woche · Minuten', exact=True).fill('120')
        if dialog.get_by_label('Status des Termins', exact=True).count():
            dialog.get_by_label('Status des Termins', exact=True).select_option('planned')
        self.assert_fields_disjoint(dialog)
        no_overflow(page)
        dialog.evaluate('element => { element.scrollTop = 0; }')
        self.shot(page, '09-ielts-populated-320-dark')
        # A reduced visual viewport checks scroll/accessibility, not a native iOS keyboard.
        page.set_viewport_size({'width': 320, 'height': 390})
        dialog.get_by_label('IELTS-Zeit pro Woche · Minuten', exact=True).focus()
        dialog.get_by_role('button', name='Ziel speichern', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        wait_state(page, 'data.ielts.examDate === "2027-01-23"')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.get_by_role('button', name='Ergebnis erfassen', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Ergebnisart', exact=True).select_option('mock')
        for skill, score in [('Listening', '7'), ('Reading', '7'), ('Writing', '5.5'), ('Speaking', '6.5')]:
            dialog.get_by_label(f'{skill} · Band', exact=True).fill(score)
        dialog.get_by_role('button', name='Ergebnis speichern', exact=True).click()
        wait_state(page, 'data.ielts.scores.length === 1')
        expect(page.locator('.ielts-coach')).to_contain_text('In 96 Tagen')
        assert state(page)['ielts']['scores'][0]['source'] == 'mock'
        self.official_links(page, 'IELTS')
        page.get_by_role('group', name='Testvorbereitung wählen').get_by_role('button', name='SAT', exact=True).click()
        page.get_by_role('button', name='SAT-Ziel festlegen', exact=True).click()
        dialog = page.get_by_role('dialog', name='Dein SAT-Ziel')
        dialog.get_by_label('Prüfungsdatum (optional)', exact=True).fill('2027-03-13')
        dialog.get_by_label('Ziel · Gesamtwert', exact=True).fill('1450')
        dialog.get_by_label('Reading and Writing · Ziel', exact=True).fill('700')
        dialog.get_by_label('Mathematics · Ziel', exact=True).fill('750')
        dialog.get_by_label('SAT-Zeit pro Woche · Minuten', exact=True).fill('150')
        dialog.get_by_label('SAT in meinem Tagesplan berücksichtigen', exact=True).check()
        self.assert_fields_disjoint(dialog)
        no_overflow(page)
        dialog.evaluate('element => { element.scrollTop = 0; }')
        self.shot(page, '10-sat-populated')
        dialog.get_by_role('button', name='SAT-Ziel speichern', exact=True).click()
        wait_state(page, 'data.sat.enabled === true && data.sat.targetTotal === 1450')
        page.get_by_role('button', name='SAT-Ergebnis erfassen', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Reading and Writing · Score', exact=True).fill('600')
        dialog.get_by_label('Mathematics · Score', exact=True).fill('700')
        expect(dialog).to_contain_text('Gesamt aus beiden Bereichen: 1300')
        dialog.get_by_role('button', name='SAT-Ergebnis speichern', exact=True).click()
        wait_state(page, 'data.sat.scores.length === 1')
        expect(page.locator('.ielts-coach')).to_contain_text('In 145 Tagen')
        expect(page.locator('.ielts-coach')).to_contain_text('1300 Punkte')
        self.official_links(page, 'SAT')
        self.with_tests = state(page)
        self.shot(page, '11-sat-plan')
        navigate(page, 'Heute')
        tasks = today_tasks(page)
        assert sum(task['minutes'] for task in tasks) <= 120
        assert len(tasks) <= 5
        assert all(task['minutes'] <= 25 for task in tasks if task.get('ieltsSkill') or task.get('satSkill'))
        assert any(task.get('examId') == 'q1-hessen-2026-exam-english' for task in tasks)
        for task in tasks:
            for session in task.get('sessions', []):
                for lesson in self.with_tests['schedule']['lessons']:
                    if lesson['day'] == 1:
                        assert session['end'] <= lesson['start'] or session['start'] >= lesson['end'], (session, lesson)
        navigate(page, 'Profil')
        page.get_by_role('tab', name='IELTS & SAT', exact=True).click()
        page.get_by_role('group', name='Testvorbereitung wählen').get_by_role('button', name='SAT', exact=True).click()
        page.get_by_role('button', name='SAT-Ziel bearbeiten', exact=True).click()
        page.get_by_label('Prüfungsdatum (optional)', exact=True).fill('2027-03-20')
        page.get_by_role('button', name='SAT-Ziel speichern', exact=True).click()
        expect(page.locator('.ielts-coach')).to_contain_text('In 152 Tagen')
        page.get_by_role('tab', name='Einstellungen', exact=True).click()
        with page.expect_download() as download:
            page.get_by_role('button', name='Backup exportieren', exact=True).click()
        backup_file = RESULTS / 'school-tests-backup.json'
        download.value.save_as(backup_file)
        backup = json.loads(backup_file.read_text())
        assert backup['sat']['examDate'] == '2027-03-20'
        assert len(backup['exams']) == 9 and len(backup['schedule']['lessons']) == 19
        page.locator('input[type=file]').set_input_files(backup_file)
        page.get_by_role('dialog').get_by_role('button', name='Wiederherstellen', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        restored = state(page)
        assert restored['ielts'] == backup['ielts'] and restored['sat'] == backup['sat']
        assert restored['exams'] == backup['exams'] and restored['schedule']['lessons'] == backup['schedule']['lessons']

    def official_links(self, page, test):
        guide = page.locator('.preparation-guide')
        expand(guide, 'Anmeldung & offizielle Informationen')
        hrefs = guide.locator('a').evaluate_all('links => links.map(link => link.href)')
        expected = ['https://www.britishcouncil.de/en/exam/ielts',
            'https://www.britishcouncil.de/en/exam/ielts/dates-fees-locations',
            'https://ielts.idp.com/germany'] if test == 'IELTS' else [
            'https://satsuite.collegeboard.org/sat/registration',
            'https://satsuite.collegeboard.org/sat/dates-deadlines']
        assert all(url in hrefs for url in expected), hrefs
        assert all(url.startswith('https://') for url in hrefs)
        # Opening a new page tests the user's link action. HTTP-source verification
        # is separate because Chromium may lack this environment's proxy CA.
        with page.expect_popup() as popup:
            guide.locator('a').first.click()
        assert popup.value.opener() == page
        popup.value.close()

    def assert_fields_disjoint(self, dialog):
        collisions = dialog.locator('input:not([type=checkbox]),select,textarea').evaluate_all('''fields => {
          const visible = fields.filter(field => field.getClientRects().length).map(field => ({
            id:field.id, rect:field.getBoundingClientRect()}));
          return visible.flatMap((a,index) => visible.slice(index+1).filter(b =>
            Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left)>1 &&
            Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top)>1
          ).map(b => [a.id,b.id]));
        }''')
        assert collisions == [], collisions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:4181')
    parser.add_argument('--case')
    arguments = parser.parse_args()
    RESULTS.mkdir(parents=True, exist_ok=True)
    cases = ['first_launch_onboarding', 'school_documents_are_reviewed_and_idempotent',
        'german_draft_requires_confirmation_and_forecast_assumptions',
        'full_journey_completion_skip_activity_and_review',
        'corrected_import_records_survive_reimport',
        'imported_timetable_and_exam_overview',
        'coordinated_ielts_sat_setup_results_and_backup', 'no_console_errors']
    if arguments.case and arguments.case not in cases:
        parser.error('Unknown case')
    selected = set(cases) if not arguments.case else {'first_launch_onboarding', 'school_documents_are_reviewed_and_idempotent', arguments.case}
    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        suite = RepairSuite(browser, arguments.url)
        for name in cases:
            if name not in selected:
                continue
            started = time.monotonic()
            try:
                getattr(suite, name)()
                results.append({'name': name, 'passed': True, 'seconds': round(time.monotonic() - started, 2)})
                print(f'PASS {name}', flush=True)
            except Exception as error:
                results.append({'name': name, 'passed': False, 'seconds': round(time.monotonic() - started, 2), 'error': str(error)})
                print(f'FAIL {name}: {error}', flush=True)
                traceback.print_exc()
                if suite.latest:
                    try:
                        suite.shot(suite.latest, f'FAIL-{name}')
                        (RESULTS / f'FAIL-{name}.txt').write_text(suite.latest.locator('body').inner_text())
                    except Exception:
                        pass
            finally:
                for context in suite.contexts:
                    context.close()
                suite.contexts = []
        browser.close()
    (RESULTS / 'results.json').write_text(json.dumps(results, indent=2, ensure_ascii=False))
    passed = sum(result['passed'] for result in results)
    print(f'{passed}/{len(results)} browser cases passed', flush=True)
    raise SystemExit(0 if passed == len(results) else 1)


if __name__ == '__main__':
    main()
