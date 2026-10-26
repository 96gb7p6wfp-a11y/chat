"""Isolated browser acceptance tests for Hessen scenarios, topics and recovery.

These tests verify arithmetic and user-supplied provisional rules. They do not
certify the unverified OAVO/KCGO content. No records are written to a real device.
Run after a production build: python3 tests/hessen_browser.py --url URL
"""
import argparse
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import time
import traceback
from playwright.sync_api import sync_playwright, expect
from coach_upgrade_browser import navigate, open_plan_view, select_profile_section, KEY, close_dialog, expand, no_overflow, state, wait_state

TODAY = '2026-10-28'
NOW = datetime(2026, 10, 28, 8, 0, tzinfo=timezone.utc)
RESULTS = Path(__file__).resolve().parents[1] / 'test-results' / 'hessen'


class HessenSuite:
    def __init__(self, browser, url):
        self.browser, self.url = browser, url.rstrip('/') + '/'
        self.contexts, self.errors, self.console_errors = [], [], []
        self.base = None
        self.latest = None

    def page(self, seed=None, width=390, dark=False, large=False):
        context = self.browser.new_context(viewport={'width': width, 'height': 844},
            is_mobile=width < 760, has_touch=width < 760, timezone_id='Europe/Berlin',
            locale='de-DE', color_scheme='dark' if dark else 'light', accept_downloads=True)
        self.contexts.append(context)
        if seed is not None:
            context.add_init_script(f'if (!localStorage.getItem({json.dumps(KEY)})) localStorage.setItem({json.dumps(KEY)}, {json.dumps(json.dumps(seed))});')
        page = context.new_page()
        self.latest = page
        page.set_default_timeout(10000)
        page.clock.install(time=NOW)
        page.on('pageerror', lambda error: self.errors.append(str(error)))
        page.on('console', lambda message: self.console_errors.append(message.text) if message.type == 'error' else None)
        page.goto(self.url, wait_until='networkidle')
        if large:
            page.add_style_tag(content='html {font-size:200%!important}')
        return page

    def shot(self, page, name):
        page.screenshot(path=str(RESULTS / f'{name}.png'), animations='disabled')

    def nav(self, page, label):
        navigate(page, label)

    def fixture(self):
        assert self.base
        data = copy.deepcopy(self.base)
        data['profile'].update({'name': 'Isolierter Hessen-Produkttest', 'schoolYear': 'Q1', 'graduationYear': '2028'})
        data['exams'] = [
            {'id': 'qa-english-q1', 'subjectId': 'english', 'title': 'Englisch Q1 · Testfall', 'date': '2026-10-26', 'semester': 'Q1', 'topics': [], 'format': 'written', 'importance': 'normal'},
            {'id': 'qa-math-q1', 'subjectId': 'mathematics', 'title': 'Mathematik Q1 · Testfall', 'date': '2026-12-17', 'semester': 'Q1', 'topics': ['Integralrechnung'], 'format': 'written', 'importance': 'normal'},
            {'id': 'qa-german-q1', 'subjectId': 'german', 'title': 'Deutsch Q1 · Testfall', 'date': '2026-12-09', 'semester': 'Q1', 'topics': [], 'format': 'written', 'importance': 'normal'},
        ]
        data['schedule']['weekly'] = [dict(day, minutes=150) for day in data['schedule']['weekly']]
        data['tasks'] = []
        return data

    def open_subject(self, page, name):
        self.nav(page, 'Fortschritt')
        page.get_by_role('button', name=f'{name}: Noten und Ziel berechnen', exact=True).click()
        return page.get_by_role('dialog', name=name, exact=True)

    def open_recovery(self, page):
        self.nav(page, 'Lernplan')
        open_plan_view(page, 'Prüfungen')
        page.locator('.exam-card').filter(has_text='Englisch Q1 · Testfall').get_by_role('button', name=re.compile('Wie lief deine Klausur|Nachbesprechung öffnen')).click()
        return page.get_by_role('dialog', name='Deine Klausur', exact=True)

    def first_launch_preserves_unknowns(self):
        page = self.page()
        page.get_by_role('button', name='Später einrichten', exact=True).click()
        wait_state(page, 'data.onboardingCompleted')
        self.base = state(page)
        assert self.base['grades'] == []
        assert self.base['hessen']['semesterResults'] == []
        assert [entry['subjectId'] for entry in self.base['hessen']['examinationSubjects'][2:]] == ['', '', '']
        assert self.base['recovery']['records'] == []
        no_overflow(page)

    def course_hours_counts_replacements_and_q4(self):
        page = self.page(self.fixture())
        for name, expected, open_count in [('Englisch', 1, 0), ('Mathematik', 2, 1), ('Deutsch', 2, 1)]:
            dialog = self.open_subject(page, name)
            requirement = dialog.locator('.hessen-course-requirements')
            requirement.locator('summary').click()
            expect(requirement.locator('.hessen-course-count')).to_contain_text(f'{expected} Leistungsnachweis')
            if open_count:
                expect(requirement).to_contain_text('Eine weitere Klausur vorgesehen — Termin noch offen.')
            else:
                assert requirement.get_by_text('Eine weitere Klausur vorgesehen — Termin noch offen.', exact=True).count() == 0
            if name == 'Deutsch':
                requirement.get_by_label('Ersatzleistung ergänzen', exact=True).select_option('presentation')
                # Pending replacements have no effect before teacher confirmation.
                expect(requirement).to_contain_text('Eine weitere Klausur vorgesehen — Termin noch offen.')
                requirement.get_by_label('Abweichungen und Ersatzleistungen von der Lehrkraft bestätigt', exact=True).check()
                assert requirement.get_by_text('Eine weitere Klausur vorgesehen — Termin noch offen.', exact=True).count() == 0
            no_overflow(page)
            close_dialog(page)
        self.nav(page, 'Fortschritt')
        page.get_by_role('button', name='Abiturplan öffnen', exact=True).click()
        dialog = page.get_by_role('dialog', name='Mein Abitur 2028', exact=True)
        dialog.get_by_role('button', name='Kursplan', exact=True).click()
        dialog.get_by_label('Halbjahr für Leistungsnachweise', exact=True).select_option('Q4')
        for index in [0, 1, 2, 3]:
            requirement = dialog.locator('.hessen-course-requirements').nth(index)
            requirement.locator('summary').click()
            expect(requirement.locator('.hessen-course-count')).to_contain_text('1 Leistungsnachweis')
            if index == 3:
                assert requirement.locator('.hessen-replacements').count() == 0, 'Q1 replacement must not leak into Q4.'
            requirement.locator('summary').click()
        assert len(state(page)['exams']) == 3, 'No fictional second English exam is created.'
        self.shot(page, '01-q4-course-plan')

    def abitur_confirmed_vs_scenario_and_weighted_maximum(self):
        page = self.page(self.fixture(), dark=True)
        self.nav(page, 'Fortschritt')
        page.get_by_role('button', name='Abiturplan öffnen', exact=True).click()
        dialog = page.get_by_role('dialog', name='Mein Abitur 2028', exact=True)
        expect(dialog.locator('.hessen-total')).to_contain_text('Offen')
        dialog.get_by_role('button', name='Prüfungen', exact=True).click()
        for slot in [3, 4, 5]:
            expect(dialog.get_by_label(f'{slot}. Prüfungsfach', exact=True)).to_have_value('')
        close_dialog(page)
        seed = self.fixture()
        subjects = seed['subjects']
        lk = [subject for subject in subjects if subject['level'] == 'LK']
        gk = [subject for subject in subjects if subject['level'] != 'LK'][:6]
        seed['hessen'] = {'targetPoints': 900, 'semesterResults': [
            {'id': f'qa-{subject["id"]}-{semester}', 'subjectId': subject['id'], 'semester': semester,
             'points': 15, 'status': 'scenario', 'inclusion': 'optional', 'included': True}
            for subject in lk+gk for semester in ['Q1', 'Q2', 'Q3', 'Q4']],
            'examinationSubjects': [{'slot': index+1, 'subjectId': subject['id'], 'points': 15,
                'status': 'scenario', 'mode': 'written' if index < 3 else 'oral'} for index, subject in enumerate(lk+gk[:3])]}
        page = self.page(seed, dark=True)
        self.nav(page, 'Fortschritt')
        page.get_by_role('button', name='Abiturplan öffnen', exact=True).click()
        dialog = page.get_by_role('dialog', name='Mein Abitur 2028', exact=True)
        expect(dialog.locator('.hessen-total')).to_contain_text('900')
        expect(dialog.locator('.hessen-blocks')).to_contain_text('600')
        expect(dialog.locator('.hessen-blocks')).to_contain_text('300')
        record = dialog.locator('.hessen-subject-result').first
        record.locator('summary').click()
        record.get_by_label('Mathematik · Q1 · Punkte', exact=True).fill('8.5')
        record.get_by_label('Status der Halbjahresnote', exact=True).select_option('confirmed')
        expect(record.get_by_role('alert')).to_contain_text('ganze Punkte')
        assert state(page)['hessen']['semesterResults'][0]['points'] == 8.5
        assert state(page)['hessen']['semesterResults'][0]['status'] == 'scenario'
        record.get_by_label('Mathematik · Q1 · Punkte', exact=True).fill('9')
        record.get_by_label('Status der Halbjahresnote', exact=True).select_option('confirmed')
        expect(dialog.locator('.hessen-total')).to_contain_text('888')
        assert state(page)['grades'] == [], 'Semester scenarios do not create individual grades.'
        expand(dialog, 'Prüfung der Einbringung')
        expect(dialog.locator('.hessen-validation')).to_contain_text('Fehlende Beleg- und Sonderfallangaben')
        expect(dialog.locator('.hessen-validation')).to_contain_text(re.compile('offen', re.I))
        self.shot(page, '02-abitur-explained-scenario')
        page.reload(wait_until='networkidle')
        assert state(page)['hessen']['semesterResults'][0]['points'] == 9
        no_overflow(page)

    def english_post_exam_diagnosis_grade_and_real_questions(self):
        page = self.page(self.fixture(), dark=True)
        dialog = self.open_recovery(page)
        expect(dialog).to_contain_text('Das Ergebnis ist noch offen')
        dialog.get_by_role('button', name='Schlecht', exact=True).click()
        dialog.get_by_role('button', name='Verbesserungsplan starten', exact=True).click()
        wait_state(page, 'data.recovery.records.some(item => item.examId === "qa-english-q1" && item.mood === "poor" && item.startDate)')
        assert state(page)['grades'] == []
        expect(dialog.locator('.recovery-plan')).to_contain_text('vorläufig')
        expand(dialog, 'Offizielle Note ist zurück')
        dialog.get_by_label('Punkte (0–15)', exact=True).fill('4')
        dialog.get_by_label('Leistungsart', exact=True).select_option('written')
        dialog.get_by_label('Tatsächliches Leistungsdatum', exact=True).fill('2026-10-26')
        dialog.get_by_label('Halbjahr', exact=True).select_option('Q1')
        dialog.get_by_label('Bestätigtes relatives Einzelgewicht', exact=True).fill('1')
        dialog.get_by_role('button', name='Bestätigte Note speichern', exact=True).click()
        wait_state(page, 'data.grades.some(item => item.subjectId === "english" && item.points === 4)')
        dialog.get_by_role('button', name='Bestätigte Note speichern', exact=True).click()
        assert len([entry for entry in state(page)['grades'] if entry['subjectId'] == 'english']) == 1
        close_dialog(page)
        self.nav(page, 'Heute')
        wait_state(page, 'data.tasks.some(item => item.date === "2026-10-28" && item.learningTopic === "recovery-english-diagnostic")')
        task = next(item for item in state(page)['tasks'] if item['date'] == TODAY and item['learningTopic'] == 'recovery-english-diagnostic')
        button = page.get_by_role('button', name=f'Lernaufgabe öffnen: {task["title"]}', exact=True)
        if not button.is_visible():
            expand(page.locator('.full-day'), 'Tagesplan & Verlauf')
        button.click()
        dialog = page.get_by_role('dialog', name='Lerneinheit', exact=True)
        expect(dialog).to_contain_text('Fehlerursache eingrenzen')
        dialog.get_by_role('button', name='Lernen starten', exact=True).click()
        if dialog.get_by_role('button', name='Zu den Aufgaben', exact=True).count():
            dialog.get_by_role('button', name='Zu den Aufgaben', exact=True).click()
        expect(dialog).to_contain_text('tablets')
        dialog.get_by_label('Deine Antwort', exact=True).fill('No. The report does not establish that grades became worse.')
        dialog.get_by_role('button', name='Antwort prüfen', exact=True).click()
        expect(dialog.locator('.tutor-model-answer')).to_contain_text('No.')
        dialog.get_by_role('button', name='Selbstständig', exact=True).click()
        dialog.get_by_role('button', name='Nächste Aufgabe', exact=True).click()
        expect(dialog).to_contain_text('Although')
        self.shot(page, '03-english-real-recovery-question')
        assert len(state(page)['exams']) == 3
        no_overflow(page)

    def semester_recovery_with_one_third_is_explicit_and_impossible_target(self):
        seed = self.fixture()
        seed['grades'] = [{'id': 'qa-returned-english', 'subjectId': 'english', 'points': 4, 'type': 'written',
            'date': '2026-10-26', 'semester': 'Q1', 'weight': 1, 'note': 'Isoliertes Testszenario'}]
        page = self.page(seed)
        dialog = self.open_subject(page, 'Englisch')
        expand(dialog, 'Halbjahresziel & Mitarbeit')
        panel = dialog.get_by_test_id('semester-estimate')
        expect(panel.get_by_label('Klausurbereich · Anteil in %', exact=True)).to_have_value('')
        panel.get_by_label('Klausuren untereinander', exact=True).select_option('equal')
        expect(panel.locator('.semester-estimate-summary')).to_contain_text('4')
        expand(panel, 'Orientierung bei nur einer Klausur')
        panel.get_by_role('button', name='Szenario 1/3 wählen', exact=True).click()
        panel.get_by_label('Mitarbeit · Punkte', exact=True).fill('13')
        expect(panel.locator('.semester-estimate-summary').locator('div').nth(2)).to_contain_text('10')
        expect(panel.locator('.semester-required').nth(2)).to_contain_text('13 / 15')
        expect(panel.get_by_label('Weitere Klausuren / vereinbarte Ersatzleistungen', exact=True)).to_have_value('0')
        self.shot(page, '04-recovery-through-participation')
        dialog.get_by_role('button', name='Noten und Ziele für Englisch einstellen', exact=True).click()
        page.get_by_label('Mein Fachziel · Punkte', exact=True).fill('13')
        page.get_by_role('button', name='Einstellungen speichern', exact=True).click()
        dialog = page.get_by_role('dialog', name='Englisch', exact=True)
        expand(dialog, 'Halbjahresziel & Mitarbeit')
        expect(dialog.get_by_test_id('semester-estimate').locator('.semester-required').nth(2)).to_contain_text('So nicht erreichbar')
        expect(dialog.get_by_test_id('semester-estimate')).to_contain_text('mehr als 15 nicht möglich')
        assert state(page)['hessen']['semesterResults'] == [], 'Estimated semester stays separate from confirmed Block I.'
        no_overflow(page)

    def curriculum_selection_real_physics_and_custom_topic(self):
        seed = self.fixture()
        seed['exams'] = []
        for subject in seed['subjects']:
            subject['enabled'] = subject['id'] in ['physics', 'german']
            subject['priority'] = 'high' if subject['id'] == 'physics' else 'low'
        seed['profile']['prioritySubjects'] = ['physics']
        page = self.page(seed, dark=True)
        dialog = self.open_subject(page, 'Physik')
        expand(dialog, 'Aktuelle Unterrichtsthemen')
        picker = dialog.get_by_role('region', name='Q1 und Q2 Unterrichtsthemen')
        topic = picker.locator('.curriculum-topic').filter(has=page.locator('summary strong', has_text=re.compile('^Entladen$')))
        topic.locator('summary').click()
        topic.get_by_label('Lernstand · Entladen', exact=True).select_option('practice')
        wait_state(page, 'data.curriculum.selections.some(item => item.topicId === "provided-physics-q1-entladen" && item.status === "practice")')
        topic.get_by_role('button', name='Dieses Thema üben', exact=True).click()
        dialog = page.get_by_role('dialog', name='Lerneinheit', exact=True)
        expect(dialog).to_be_visible()
        wait_state(page, 'data.tasks.some(item => item.id === "topic-2026-10-28-provided-physics-q1-entladen" && item.subjectId === "physics" && item.learningTopic.includes("Entladen"))')
        current = state(page)
        planned = [item for item in current['tasks'] if item['date'] == TODAY and not item.get('skipped') and not item.get('parked')]
        assert sum(item['minutes'] for item in planned) <= 150, 'Starting a topic must share the existing study budget.'
        expect(dialog).to_contain_text(re.compile('entladen|Entladung', re.I))
        dialog.get_by_role('button', name='Lernen starten', exact=True).click()
        if dialog.get_by_role('button', name='Zu den Aufgaben', exact=True).count():
            dialog.get_by_role('button', name='Zu den Aufgaben', exact=True).click()
        expect(dialog).to_contain_text('R = 100 kΩ, C = 100 µF und U₀ = 12 V. Berechne τ und U(10 s).')
        dialog.get_by_label('Deine Antwort', exact=True).fill('τ = 100000 × 0.0001 s = 10 s; U(10 s) = 12 e^(-1) V ≈ 4.41 V')
        dialog.get_by_role('button', name='Antwort prüfen', exact=True).click()
        expect(dialog.locator('.tutor-model-answer')).to_contain_text(re.compile('4[,.]41'))
        self.shot(page, '05-physics-selected-exercise')
        close_dialog(page)
        dialog = self.open_subject(page, 'Deutsch')
        expand(dialog, 'Aktuelle Unterrichtsthemen')
        picker = dialog.get_by_role('region', name='Q1 und Q2 Unterrichtsthemen')
        picker.get_by_role('button', name='Thema ergänzen', exact=True).click()
        picker.get_by_label('Thema', exact=True).fill('Weimarer Klassik · Unterrichtsthema')
        picker.get_by_role('button', name='Thema speichern', exact=True).click()
        expect(picker).to_contain_text('Weimarer Klassik')
        assert state(page)['curriculum']['customTopics'][0]['origin'] == 'teacher'
        page.reload(wait_until='networkidle')
        assert any(item['title'] == 'Weimarer Klassik · Unterrichtsthema' for item in state(page)['curriculum']['customTopics'])
        no_overflow(page)

    def narrow_populated_forms_and_large_text(self):
        for dark in [False, True]:
            page = self.page(self.fixture(), width=320, dark=dark, large=True)
            self.nav(page, 'Fortschritt')
            page.get_by_role('button', name='Abiturplan öffnen', exact=True).click()
            dialog = page.get_by_role('dialog', name='Mein Abitur 2028', exact=True)
            record = dialog.locator('.hessen-subject-result').first
            record.locator('summary').click()
            record.get_by_label('Mathematik · Q1 · Punkte', exact=True).fill('10')
            record.get_by_label('Status der Halbjahresnote', exact=True).select_option('confirmed')
            no_overflow(page)
            self.shot(page, f'06-semester-320-large-{dark}')
            dialog.get_by_role('button', name='Prüfungen', exact=True).click()
            dialog.get_by_label('3. Prüfungsfach', exact=True).select_option('english')
            dialog.get_by_label('Punkte · Fach 3', exact=True).fill('12')
            dialog.get_by_label('Ergebnisstatus · Fach 3', exact=True).select_option('confirmed')
            no_overflow(page)
            self.shot(page, f'07-exams-320-large-{dark}')
            dialog.get_by_role('button', name='Kursplan', exact=True).click()
            requirement = dialog.locator('.hessen-course-requirements').first
            requirement.locator('summary').click()
            requirement.get_by_label('Wochenstunden', exact=True).fill('5')
            requirement.get_by_label('Absprache mit der Lehrkraft · optional', exact=True).fill('Lange bestätigte Absprache zum Leistungsnachweis und der schriftlichen Ersatzleistung.')
            no_overflow(page)
            self.shot(page, f'08-courses-320-large-{dark}')
            close_dialog(page)
            dialog = self.open_recovery(page)
            dialog.get_by_role('button', name='Schlecht', exact=True).click()
            dialog.get_by_label('Feedback der Lehrkraft · optional', exact=True).fill('Bitte Textbeleg und rhetorische Wirkung präzise erklären.')
            no_overflow(page)
            self.shot(page, f'09-recovery-320-large-{dark}')
            close_dialog(page)

    def no_console_errors(self):
        assert not self.errors, self.errors
        assert not self.console_errors, self.console_errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--case')
    args = parser.parse_args()
    RESULTS.mkdir(parents=True, exist_ok=True)
    cases = ['first_launch_preserves_unknowns', 'course_hours_counts_replacements_and_q4',
        'abitur_confirmed_vs_scenario_and_weighted_maximum', 'english_post_exam_diagnosis_grade_and_real_questions',
        'semester_recovery_with_one_third_is_explicit_and_impossible_target', 'curriculum_selection_real_physics_and_custom_topic',
        'narrow_populated_forms_and_large_text', 'no_console_errors']
    if args.case and args.case not in cases:
        parser.error('Unknown case')
    selected = cases if not args.case else ['first_launch_preserves_unknowns', args.case]
    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        suite = HessenSuite(browser, args.url)
        for name in selected:
            started = time.monotonic()
            try:
                getattr(suite, name)()
                results.append({'name': name, 'passed': True, 'seconds': round(time.monotonic()-started, 2)})
                print('PASS', name, flush=True)
            except Exception as error:
                results.append({'name': name, 'passed': False, 'error': str(error)})
                print('FAIL', name, error, flush=True)
                traceback.print_exc()
                if suite.latest:
                    suite.shot(suite.latest, 'FAIL-'+name)
                    (RESULTS / ('FAIL-'+name+'.txt')).write_text(suite.latest.locator('body').inner_text())
            finally:
                for context in suite.contexts:
                    context.close()
                suite.contexts = []
        browser.close()
    (RESULTS/'results.json').write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f'{sum(result["passed"] for result in results)}/{len(results)} browser cases passed', flush=True)
    raise SystemExit(0 if all(result['passed'] for result in results) else 1)

if __name__ == '__main__':
    main()
