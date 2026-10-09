"""Exercise Northstar's real local coaching flow in touch/mobile Chromium.

    python tests/browser_smoke.py --url http://127.0.0.1:4173 --production

Browser time is fixed to Thursday 8 October 2026 in Europe/Berlin. Tests enter
personal data through the UI, then reuse exported state in isolated contexts.
No admissions outcomes or native iOS app restriction capabilities are assumed.
"""

import argparse
import copy
from datetime import datetime, timedelta, timezone
import json
import re
import time
import traceback
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

KEY = 'northstar.coach.v2'
LEGACY_KEY = 'northstar.data.v1'
TODAY = '2026-10-08'
RESULTS = Path(__file__).resolve().parents[1] / 'test-results'
FIXED_TIME = datetime(2026, 10, 8, 9, 0, tzinfo=timezone.utc)


def state(page):
    return page.evaluate('key => JSON.parse(localStorage.getItem(key))', KEY)


def wait_state(page, expression):
    page.wait_for_function(f'key => {{ const data = JSON.parse(localStorage.getItem(key)); return data && ({expression}); }}', arg=KEY)


def today_tasks(page):
    return [task for task in state(page)['tasks'] if task['date'] == TODAY]


def displayed_minutes(text):
    match = re.fullmatch(r'(?:(\d+)h(?: (\d+)m)?|(\d+) min)', text.strip())
    assert match, f'Unexpected study time: {text!r}'
    return int(match[1] or 0) * 60 + int(match[2] or match[3] or 0)


def preview_budget(page):
    text = page.locator('.plan-screen .card').first.locator(':scope > p.muted').first.inner_text()
    match = re.fullmatch(r'(.+) available · (.+) planned', text)
    assert match, f'Unexpected plan budget: {text!r}'
    return displayed_minutes(match[1]), displayed_minutes(match[2])


def navigate(page, label, mobile=True):
    nav = page.get_by_role('navigation', name='Mobile navigation' if mobile else 'Main navigation')
    nav.get_by_role('button', name=label, exact=True).click()
    expect(page.get_by_role('heading', name=label, exact=True)).to_be_visible()


def close_dialog(page):
    page.get_by_role('dialog').get_by_role('button', name='Close dialog').click()
    expect(page.get_by_role('dialog')).to_have_count(0)


def expand_details(container, label):
    # A scoped locator inside filter(has=...) would include the outer region
    # selector again; summaries work for both a details root and its children.
    for summary in container.locator('summary').all():
        if summary.inner_text().strip() == label:
            details = summary.locator('xpath=..')
            if details.get_attribute('open') is None:
                summary.click()
            return


def study_budget(page):
    budget = page.get_by_role('region', name='Study time budget')
    expand_details(budget, 'Today’s time')
    return budget


def goal_hierarchy(page):
    hierarchy = page.locator('.goal-hierarchy')
    expand_details(hierarchy, 'The bigger picture')
    return hierarchy


def reveal_button(page, label):
    button = page.get_by_role('button', name=label, exact=True, include_hidden=True)
    if not button.is_visible():
        parents = button.locator('xpath=ancestor::details').all()
        for details in reversed(parents):
            if details.get_attribute('open') is None:
                details.locator(':scope > summary').click()
    return button


def no_overflow(page):
    widths = page.evaluate('''() => ({viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth, body: document.body.scrollWidth})''')
    assert widths['document'] <= widths['viewport'] + 1, widths
    assert widths['body'] <= widths['viewport'] + 1, widths
    dialogs = page.get_by_role('dialog')
    if dialogs.count():
        dimensions = dialogs.evaluate('el => ({width:el.clientWidth,scroll:el.scrollWidth})')
        assert dimensions['scroll'] <= dimensions['width'] + 1, dimensions


def no_tab_label_overlap(page):
    widths = page.get_by_role('tablist', name='Profile sections').get_by_role('tab').evaluate_all('''tabs => tabs.map(tab => {
      const range=document.createRange(); range.selectNodeContents(tab);
      return {label:tab.textContent, button:tab.clientWidth, text:range.getBoundingClientRect().width};
    })''')
    assert all(tab['text'] <= tab['button'] + 1 for tab in widths), widths


def screenshot(page, name, full_page=False):
    expect(page.locator('.toast')).to_have_count(0)
    page.screenshot(path=str(RESULTS / name), full_page=full_page, animations='disabled')


def assert_sessions_free(tasks, start='17:00', end='19:00'):
    intervals = []
    for task in tasks:
        assert task.get('sessions'), f"Task lacks allocated sessions: {task}"
        total = 0
        for session in task['sessions']:
            assert session['end'] <= start or session['start'] >= end, task
            a = sum(int(v) * weight for v, weight in zip(session['start'].split(':'), (60, 1)))
            b = sum(int(v) * weight for v, weight in zip(session['end'].split(':'), (60, 1)))
            total += b - a
            intervals.append((a, b))
        assert total == task['minutes'], task
    intervals.sort()
    assert all(a[1] <= b[0] for a, b in zip(intervals, intervals[1:])), intervals


def choose_today_budget(page, minutes):
    page.get_by_role('button', name='Adjust available time', exact=True).click()
    dialog = page.get_by_role('dialog', name='Make today realistic')
    dialog.get_by_label('Study allowance (minutes)', exact=True).fill(str(minutes))
    dialog.get_by_role('button', name='Recalculate my day', exact=True).click()
    wait_state(page, f'data.schedule.timeOverrides.some(day => day.date === "{TODAY}" && day.minutes === {minutes})')


def case(results, name, function):
    started = time.monotonic()
    try:
        function()
        results.append({'name': name, 'passed': True, 'seconds': round(time.monotonic() - started, 2)})
        print(f'PASS {name}', flush=True)
    except Exception as error:
        results.append({'name': name, 'passed': False, 'seconds': round(time.monotonic() - started, 2), 'error': str(error)})
        print(f'FAIL {name}: {error}', flush=True)
        traceback.print_exc()


class Suite:
    def __init__(self, browser, url, production):
        self.browser = browser
        self.url = url.rstrip('/') + '/'
        self.production = production
        self.contexts = []
        self.errors = []
        self.console_errors = []
        self.personal = None

    def new_page(self, seed=None, mobile=True, raw=None, legacy=None, clock=FIXED_TIME, timer_clock=False):
        context = self.browser.new_context(viewport={'width': 390 if mobile else 1440, 'height': 844 if mobile else 1000},
            is_mobile=mobile, has_touch=mobile, timezone_id='Europe/Berlin', accept_downloads=True)
        self.contexts.append(context)
        if seed is not None or raw is not None:
            content = raw if raw is not None else json.dumps(seed)
            context.add_init_script(f'if (!localStorage.getItem({json.dumps(KEY)})) localStorage.setItem({json.dumps(KEY)}, {json.dumps(content)});')
        if legacy is not None:
            context.add_init_script(f'if (!localStorage.getItem({json.dumps(LEGACY_KEY)})) localStorage.setItem({json.dumps(LEGACY_KEY)}, {json.dumps(json.dumps(legacy))});')
        page = context.new_page()
        page.on('pageerror', lambda error: self.errors.append(str(error)))
        page.on('console', lambda message: self.console_errors.append(message.text) if message.type == 'error' else None)
        page.set_default_timeout(10000)
        if timer_clock:
            # Freeze controllable wall time before opening the app. run_for advances
            # Date and timer callbacks together; set_system_time covers background
            # recovery without replaying thousands of interval callbacks.
            page.clock.install(time=clock)
            page.clock.pause_at(clock + timedelta(seconds=1))
        else:
            page.clock.set_fixed_time(clock)
        page.goto(self.url)
        expect(page.get_by_role('heading', name='Today', exact=True)).to_be_visible()
        return page

    def personal_page(self, mobile=True):
        assert self.personal is not None, 'Personal onboarding must pass before dependent cases.'
        return self.new_page(seed=copy.deepcopy(self.personal), mobile=mobile)

    def onboarding(self):
        page = self.new_page()
        dialog = page.get_by_role('dialog', name='Make Northstar yours')
        expect(dialog).to_be_visible()
        no_overflow(page)
        dialog.get_by_label('Your name (optional)').fill('Eric')
        expect(dialog.get_by_label('Current school year')).to_have_value('Q1')
        expect(dialog.get_by_label('Expected Abitur year')).to_have_value('2028')
        dialog.get_by_label('USA target universities (optional)').fill('UCLA\nUC Berkeley')
        dialog.get_by_label('Germany target universities (optional)').fill('TU Darmstadt')
        dialog.get_by_role('button', name='Continue', exact=True).click()
        for label, value in [('Mathematics written points', '6'), ('Mathematics oral points', '11'), ('Mathematics target points', '10'), ('English written points', '7'), ('English target points', '10')]:
            dialog.get_by_label(label, exact=True).fill(value)
        dialog.get_by_label('Mathematics weak topics').fill('derivatives, vectors')
        dialog.get_by_label('English weak topics').fill('summary, analysis')
        dialog.get_by_label('English level', exact=True).select_option('B2')
        dialog.get_by_label('German level', exact=True).select_option('Native / fluent')
        dialog.get_by_role('button', name='Continue', exact=True).click()
        dialog.get_by_label('Thursday available study minutes').fill('85')
        dialog.get_by_label('Thursday study starts').fill('16:00')
        dialog.get_by_label('Thursday study ends').fill('21:00')
        dialog.get_by_role('button', name='Add', exact=True).click()
        dialog.get_by_label('Activity name', exact=True).fill('Volleyball training')
        dialog.get_by_label('Mon', exact=True).uncheck()
        dialog.get_by_label('Thu', exact=True).check()
        dialog.get_by_label('Activity start').fill('17:00')
        dialog.get_by_label('Activity end').fill('19:00')
        dialog.get_by_role('button', name='Save fixed activity', exact=True).click()
        dialog.get_by_role('button', name='Continue', exact=True).click()
        dialog.get_by_role('button', name='Add exam', exact=True).click()
        dialog.get_by_label('Exam subject').select_option('english')
        dialog.get_by_label('Exam title').fill('English Klausur')
        dialog.get_by_label('Exam date').fill('2026-10-26')
        dialog.get_by_label('Exam topics').fill('American Dream\nUS history\nCivil Rights\nsummary\nanalysis\ncomment')
        dialog.get_by_role('button', name='Save exam', exact=True).click()
        dialog.get_by_role('button', name='Create my plan', exact=True).click()
        expect(dialog).to_have_count(0)
        wait_state(page, "data.onboardingCompleted && !data.demo && data.profile.name === 'Eric'")
        saved = state(page)
        assert saved['profile']['schoolYear'] == 'Q1'
        assert 'Hessen' in saved['profile']['schoolSystem']
        assert str(saved['profile']['graduationYear']) == '2028'
        assert saved['profile']['englishLevel'] == 'B2'
        mathematics = next(s for s in saved['subjects'] if s['id'] == 'mathematics')
        assert (mathematics['written'], mathematics['oral'], mathematics['target'], mathematics['level']) == (6, 11, 10, 'LK')
        assert next(s for s in saved['subjects'] if s['id'] == 'physics')['level'] == 'LK'
        assert len(saved['exams']) == 1 and saved['exams'][0]['topics'][-1] == 'comment'
        assert saved['grades'] == [], 'Starting grades must not become invented grade records.'
        assert len(saved['activities']) == 4
        assert all(not activity['achievements'] and not activity['impact'] for activity in saved['activities']), 'Known activities must never acquire invented achievements.'
        assert all(not task['completed'] for task in saved['tasks'])
        tasks = today_tasks(page)
        assert 3 <= len(tasks) <= 5, tasks
        assert sum(task['minutes'] for task in tasks) <= 85
        assert any(task['examId'] == saved['exams'][0]['id'] for task in tasks), tasks
        assert any(task['subjectId'] == 'mathematics' for task in tasks), tasks
        assert all(task['reason'] and task['priority'] and task['minutes'] > 0 for task in tasks)
        assert all(task.get('roadmapItemId') and task.get('linkedGoal') for task in tasks), 'Every daily priority must explain its long-term university goal.'
        english_task = next(task for task in tasks if task['examId'] == saved['exams'][0]['id'])
        math_task = next(task for task in tasks if task['subjectId'] == 'mathematics')
        assert 'Improve English writing and exam performance' in english_task['linkedGoal'], english_task
        assert 'Improve written Mathematics and Physics grades' in math_task['linkedGoal'], math_task
        assert 'Written 6 points' in math_task['reason'] and 'oral 11 points' in math_task['reason'], math_task
        assert 'written result needs improvement' in math_task['reason'], math_task
        expect(page.locator('.task-linked-goal')).to_have_count(0)
        expect(page.locator('.today-greeting')).to_have_text('Good morning, Eric')
        expect(page.locator('.goal-label')).to_contain_text('Today’s focus')
        assert_sessions_free(tasks)
        expect(page.locator('.demo-banner')).to_have_count(0)
        expect(page.locator('.today-date')).to_contain_text(re.compile('Thursday,? 8 October'))
        no_overflow(page)
        screenshot(page, 'northstar-coach-mobile.png', full_page=True)
        self.personal = saved

    def complete_and_notes(self):
        page = self.personal_page()
        task = today_tasks(page)[0]
        page.get_by_role('button', name='Open ' + task['title'], exact=True).click()
        dialog = page.get_by_role('dialog', name='Your next step')
        expect(dialog.locator('.exercise-prompt')).to_be_visible()
        assert len(dialog.locator('.exercise-prompt').inner_text()) > 60
        assert dialog.locator('.practice-step').count() >= 2
        dialog.get_by_label('Your work & notes').fill('I practised derivatives; I must check signs in the next attempt.')
        dialog.get_by_role('button', name='Save notes', exact=True).click()
        wait_state(page, "data.tasks.some(t => t.notes.includes('check signs'))")
        close_dialog(page)
        page.reload()
        page.get_by_role('button', name='Open ' + task['title'], exact=True).click()
        expect(dialog.get_by_label('Your work & notes')).to_have_value('I practised derivatives; I must check signs in the next attempt.')
        dialog.get_by_role('button', name='Complete task', exact=True).click()
        wait_state(page, f'data.tasks.some(t => t.id === {json.dumps(task["id"])} && t.completed && t.completedAt)')
        expect(page.locator('.daily-task-heading')).to_contain_text('1 of')
        count = page.locator('.task-card').count()
        assert 3 <= count <= 5
        page.reload()
        expect(page.get_by_role('button', name='Undo ' + task['title'], exact=True)).to_have_attribute('aria-pressed', 'true')
        navigate(page, 'Progress')
        expect(page.locator('.stats-grid').first).to_contain_text('1 /')
        expect(page.locator('.stats-grid').first).to_contain_text(f"{task['minutes']} min")
        expect(page.locator('.consistency-dot.completed')).to_have_count(1)
        assert len([t for t in state(page)['tasks'] if t['completed']]) == 1
        self.personal = state(page)

    def exam_crud(self):
        page = self.personal_page()
        navigate(page, 'Plan')
        page.get_by_role('button', name='Exams', exact=True).click()
        english = page.locator('.exam-card').filter(has_text='English Klausur')
        expand_details(english, 'Revision plan')
        assert english.locator('.revision-stage').count() >= 5
        expect(english).to_contain_text('summary')
        page.get_by_role('button', name='Add exam', exact=True).click()
        dialog = page.get_by_role('dialog', name='Add an exam')
        dialog.get_by_label('Subject', exact=True).select_option('physics')
        dialog.get_by_label('Exam title').fill('Physics mechanics')
        dialog.get_by_label('Exam date').fill('2026-10-11')
        dialog.get_by_label('Target points').fill('12')
        dialog.get_by_label('Topics', exact=True).fill('Newton laws\nEnergy conservation')
        dialog.get_by_role('button', name='Create revision plan', exact=True).click()
        wait_state(page, "data.exams.some(e => e.title === 'Physics mechanics')")
        physics = page.locator('.exam-card').filter(has_text='Physics mechanics')
        expand_details(physics, 'Revision plan')
        assert 1 <= physics.locator('.revision-stage').count() <= 6
        navigate(page, 'Today')
        assert any(t['subjectId'] == 'physics' and t['priority'] == 'high' for t in today_tasks(page)), today_tasks(page)
        navigate(page, 'Plan')
        page.get_by_role('button', name='Exams', exact=True).click()
        page.get_by_role('button', name='Edit Physics mechanics', exact=True).click()
        dialog = page.get_by_role('dialog', name='Edit exam')
        dialog.get_by_label('Exam date').fill('2026-10-30')
        dialog.get_by_label('Topics', exact=True).fill('Waves\nInterference')
        dialog.get_by_role('button', name='Save exam', exact=True).click()
        wait_state(page, "data.exams.some(e => e.title === 'Physics mechanics' && e.date === '2026-10-30' && e.topics[0] === 'Waves')")
        exam_id = next(e['id'] for e in state(page)['exams'] if e['title'] == 'Physics mechanics')
        page.get_by_role('button', name='Delete Physics mechanics', exact=True).click()
        page.get_by_role('dialog', name='Remove this exam?').get_by_role('button', name='Remove exam', exact=True).click()
        wait_state(page, f'!data.exams.some(e => e.id === {json.dumps(exam_id)})')
        assert not any(t['examId'] == exam_id and not t['completed'] for t in state(page)['tasks'])
        page.get_by_role('button', name='Week', exact=True).click()
        page.get_by_role('button', name='Next week', exact=True).click()
        page.get_by_role('button', name='Friday 16 October', exact=True).click()
        expect(page.locator('.plan-screen')).to_contain_text('English Klausur')
        page.get_by_role('button', name='Open day', exact=True).click()
        expect(page.get_by_role('heading', name='Friday', exact=True)).to_be_visible()
        expect(page.locator('.page-kicker').first).to_have_text('PLAN PREVIEW')
        assert all(button.is_disabled() for button in page.locator('.task-complete').all())
        assert any(t['examId'] for t in state(page)['tasks'] if t['date'] == '2026-10-16')

    def schedule_and_rest(self):
        page = self.personal_page()
        navigate(page, 'Plan')
        page.get_by_role('button', name='Schedule', exact=True).click()
        page.get_by_label('Thursday study minutes', exact=True).fill('180')
        page.get_by_label('Thursday window start', exact=True).fill('16:00')
        page.get_by_label('Thursday window end', exact=True).fill('20:00')
        page.get_by_role('button', name='Save weekly timetable', exact=True).click()
        wait_state(page, "data.schedule.weekly.some(d => d.day === 4 && d.minutes === 180 && d.windowEnd === '20:00')")
        navigate(page, 'Today')
        assert sum(t['minutes'] for t in today_tasks(page)) <= 120, today_tasks(page)
        assert_sessions_free(today_tasks(page))
        expect(page.get_by_role('region', name='Study time budget')).to_contain_text('2h')
        page.get_by_role('button', name='Adjust available time', exact=True).click()
        dialog = page.get_by_role('dialog', name='Make today realistic')
        dialog.get_by_label('Study allowance (minutes)').fill('0')
        dialog.get_by_role('button', name='Recalculate my day', exact=True).click()
        wait_state(page, "data.schedule.timeOverrides.some(d => d.date === '2026-10-08' && d.minutes === 0)")
        # Historical completed work remains; no new work can be allocated to a rest day.
        assert all(t['completed'] for t in today_tasks(page)), today_tasks(page)
        assert page.locator('.task-card:not(.is-complete)').count() == 0
        page.get_by_role('button', name='Adjust available time', exact=True).click()
        dialog.get_by_label('Study allowance (minutes)').fill('5')
        dialog.get_by_role('button', name='Recalculate my day', exact=True).click()
        assert sum(t['minutes'] for t in today_tasks(page) if not t['completed']) <= 5
        no_overflow(page)

    def realistic_day_priorities(self):
        seed = copy.deepcopy(self.personal)
        # Compare actual priorities with the same profile and no retained work.
        # The study window has three free hours around volleyball, so both
        # allowances are possible without inventing time in a fixed activity.
        seed['tasks'] = []
        page = self.new_page(seed=seed)
        choose_today_budget(page, 45)
        short = today_tasks(page)
        short_minutes = sum(task['minutes'] for task in short)
        assert 0 < short_minutes <= 45, short
        assert len(short) <= 5
        assert any(task['examId'] == seed['exams'][0]['id'] for task in short), 'A nearby exam must remain a priority on a short day.'
        assert_sessions_free(short)
        budget = study_budget(page)
        assert displayed_minutes(budget.locator('strong').nth(0).inner_text()) == 45
        assert displayed_minutes(budget.locator('strong').nth(1).inner_text()) == short_minutes

        choose_today_budget(page, 180)
        longer = today_tasks(page)
        long_minutes = sum(task['minutes'] for task in longer)
        assert 3 <= len(longer) <= 5, longer
        assert short_minutes < long_minutes <= 180, (short, longer)
        assert len({task['id'] for task in longer}) == len(longer)
        assert any(task['examId'] == seed['exams'][0]['id'] for task in longer)
        assert any(task['subjectId'] == 'mathematics' for task in longer)
        assert all(task['reason'] and task['goalId'] and task['priority'] for task in longer)
        assert_sessions_free(longer)
        no_overflow(page)

    def subjects_and_zero_grade(self):
        page = self.personal_page()
        navigate(page, 'Profile')
        page.get_by_role('tab', name='Subjects', exact=True).click()
        page.get_by_role('button', name='Edit German', exact=True).click()
        dialog = page.get_by_role('dialog', name='Edit subject')
        dialog.get_by_label('Written points', exact=True).fill('0')
        dialog.get_by_label('Oral points', exact=True).fill('0')
        dialog.get_by_label('Target points', exact=True).fill('15')
        dialog.get_by_label('Weak topics', exact=True).fill('argumentation\ngrammar')
        dialog.get_by_role('button', name='Save changes', exact=True).click()
        wait_state(page, "data.subjects.some(s => s.id === 'german' && s.written === 0 && s.target === 15)")
        navigate(page, 'Today')
        assert any(t['subjectId'] == 'german' for t in today_tasks(page)), today_tasks(page)
        navigate(page, 'Progress')
        page.get_by_role('button', name='Record grade for Mathematics', exact=True).click()
        dialog = page.get_by_role('dialog', name='Record a grade')
        dialog.get_by_label('Points (0–15)').fill('16')
        assert not dialog.get_by_label('Points (0–15)').evaluate('input => input.checkValidity()')
        dialog.get_by_label('Points (0–15)').fill('0')
        dialog.get_by_label('Note (optional)').fill('Zero points is a valid recorded result')
        dialog.get_by_role('button', name='Save grade', exact=True).click()
        wait_state(page, "data.grades.some(g => g.points === 0 && g.subjectId === 'mathematics')")
        page.reload()
        math = page.locator('.subject-progress').filter(has=page.get_by_text('Mathematics', exact=True))
        expect(math.locator('.grade-values')).to_contain_text('Written0')
        page.get_by_role('button', name=re.compile('View grade history')).click()
        expect(page.get_by_text('Zero points is a valid recorded result', exact=True)).to_be_visible()
        page.get_by_role('button', name=f'Delete grade 0 in Mathematics on {TODAY}', exact=True).click()
        wait_state(page, '!data.grades.some(g => g.points === 0)')
        expect(math.locator('.grade-values')).to_contain_text('Written6')

    def weekly_review(self):
        page = self.personal_page()
        navigate(page, 'Plan')
        page.get_by_role('button', name='Schedule', exact=True).click()
        page.get_by_label('Monday study minutes', exact=True).fill('80')
        page.get_by_role('button', name='Save weekly timetable', exact=True).click()
        wait_state(page, 'data.schedule.weekly.some(day => day.day === 1 && day.minutes === 80)')
        page.get_by_role('button', name='Week', exact=True).click()
        page.get_by_role('button', name='Next week', exact=True).click()
        page.get_by_role('button', name='Monday 12 October', exact=True).click()
        before = page.locator('.plan-screen .card').first.inner_text()
        before_available, before_planned = preview_budget(page)
        navigate(page, 'Progress')
        page.get_by_role('button', name='Review week', exact=True).click()
        dialog = page.get_by_role('dialog', name='Your weekly review')
        dialog.get_by_label('What worked, and what would you change?').fill('Start earlier and focus on Physics next week.')
        dialog.get_by_label('Next week’s focus subject').select_option('physics')
        dialog.get_by_label('Next week’s study load').select_option('lighter')
        dialog.get_by_role('button', name='Save & adjust next week', exact=True).click()
        wait_state(page, "data.weeklyReviews.some(r => r.focusSubjectId === 'physics' && r.effort === 'lighter')")
        page.reload()
        expect(page.get_by_text('“Start earlier and focus on Physics next week.”', exact=True)).to_be_visible()
        navigate(page, 'Plan')
        page.get_by_role('button', name='Next week', exact=True).click()
        page.get_by_role('button', name='Monday 12 October', exact=True).click()
        after = page.locator('.plan-screen .card').first.inner_text()
        assert after != before, (before, after)
        expect(page.locator('.plan-screen .card').first).to_contain_text('Physics')
        after_available, after_planned = preview_budget(page)
        assert after_available == before_available, 'A lighter plan must preserve actual availability.'
        assert 0 < after_planned <= int(after_available * .8), (before, after)
        assert after_planned < before_planned, 'Saving lighter must reduce real planned work, not just a setting.'

        monday = self.new_page(seed=state(page), clock=datetime(2026, 10, 12, 9, tzinfo=timezone.utc))
        wait_state(monday, "data.tasks.some(t => t.date === '2026-10-12')")
        tasks = [task for task in state(monday)['tasks'] if task['date'] == '2026-10-12']
        assert sum(task['minutes'] for task in tasks) == after_planned
        assert 3 <= len(tasks) <= 5 and any(task['subjectId'] == 'physics' for task in tasks)
        same_focus = state(page)
        for review in same_focus['weeklyReviews']:
            if review['weekStart'] == '2026-10-05':
                review['effort'] = 'same'
        control = self.new_page(seed=same_focus, clock=datetime(2026, 10, 12, 9, tzinfo=timezone.utc))
        wait_state(control, "data.tasks.some(t => t.date === '2026-10-12')")
        control_minutes = sum(task['minutes'] for task in state(control)['tasks'] if task['date'] == '2026-10-12')
        assert after_planned < control_minutes, 'Lighter must reduce work with the same focus, not merely change priorities.'
        expect(monday.locator('.daily-goal')).to_contain_text('20% study-time buffer')
        budget = study_budget(monday)
        assert displayed_minutes(budget.locator('strong').nth(0).inner_text()) == after_available
        assert displayed_minutes(budget.locator('strong').nth(1).inner_text()) == after_planned
        sunday = self.new_page(seed=state(page), clock=datetime(2026, 10, 11, 9, tzinfo=timezone.utc))
        expect(sunday.get_by_role('button', name=re.compile('Your Sunday review'))).to_be_visible()

    def roadmap(self):
        page = self.personal_page()
        navigate(page, 'Plan')
        page.get_by_role('button', name='Roadmap', exact=True).click()
        expect(page.locator('.roadmap-timeline')).to_contain_text('Q1')
        expect(page.locator('.roadmap-timeline')).to_contain_text('Abitur')
        usa_button = page.locator('.roadmap-item .task-check').first
        usa_name = usa_button.get_attribute('aria-label')
        screenshot(page, 'northstar-core-roadmap-usa.png')
        usa_button.click()
        wait_state(page, 'data.roadmapCompleted.length === 1')
        page.get_by_role('button', name='Germany', exact=True).click()
        germany_button = page.locator('.roadmap-item .task-check').first
        germany_name = germany_button.get_attribute('aria-label')
        assert germany_name != usa_name
        screenshot(page, 'northstar-core-roadmap-germany.png')
        germany_button.click()
        wait_state(page, 'data.roadmapCompleted.length === 2')
        page.reload()
        page.get_by_role('button', name='Roadmap', exact=True).click()
        expect(page.get_by_role('button', name=usa_name.replace('Complete', 'Unmark', 1), exact=True)).to_have_attribute('aria-pressed', 'true')
        page.get_by_role('button', name='Germany', exact=True).click()
        expect(page.get_by_role('button', name=germany_name.replace('Complete', 'Unmark', 1), exact=True)).to_have_attribute('aria-pressed', 'true')
        navigate(page, 'Progress')
        expect(page.locator('.roadmap-progress').filter(has_text='USA')).to_contain_text('1/')
        expect(page.locator('.roadmap-progress').filter(has_text='Germany')).to_contain_text('1/')
        no_overflow(page)

    def roadmap_to_daily_action(self):
        seed = copy.deepcopy(self.personal)
        seed['tasks'] = []
        seed['exams'] = []
        seed['profile']['pathways'] = ['USA']
        # A quiet university-only fixture lets us follow one real roadmap
        # action without an exam legitimately taking its place in the queue.
        for subject in seed['subjects']:
            subject['enabled'] = False
        page = self.new_page(seed=seed)
        tasks = today_tasks(page)
        linked = next((task for task in tasks if task.get('roadmapItemId') and task.get('roadmapStepId')), None)
        assert linked is not None, 'A quiet day must produce a concrete university milestone action.'
        assert linked['linkedGoal'], linked
        assert linked['reason'] and linked['minutes'] > 0
        assert len(tasks) <= 5 and sum(task['minutes'] for task in tasks) <= 85

        page.get_by_role('button', name='Open ' + linked['title'], exact=True).click()
        detail = page.get_by_role('dialog', name='Your next step')
        expect(detail.locator('.exercise-prompt p').first).to_have_text(linked['title'])
        assert detail.locator('.practice-step p').all_inner_texts() == linked['steps'], 'A roadmap task must open its actual action instructions.'
        expect(detail.locator('.practice-passage')).to_have_count(0)
        expand_details(detail, 'Why this task')
        expect(detail.get_by_role('region', name='Linked long-term goal')).to_contain_text(linked['linkedGoal'])
        close_dialog(page)

        reveal_button(page, 'How this fits your goals').click()
        purpose = page.get_by_role('dialog', name='From your goal to today')
        for label in ('LONG-TERM', 'THIS YEAR', 'THIS SEMESTER', 'THIS MONTH', 'THIS WEEK', 'TODAY'):
            expect(purpose.get_by_text(label, exact=True)).to_be_visible()
        close_dialog(page)
        navigate(page, 'Plan')
        hierarchy = goal_hierarchy(page)
        for label in ('Long term', 'This month', 'This week', 'Today'):
            expect(hierarchy.get_by_text(label, exact=True)).to_be_visible()
        hierarchy.get_by_text('Year and semester priorities', exact=True).click()
        expect(hierarchy.get_by_text('This year', exact=True)).to_be_visible()
        expect(hierarchy.get_by_text('This semester', exact=True)).to_be_visible()
        assert hierarchy.locator('.goal-item').count() >= 4
        hierarchy.scroll_into_view_if_needed()
        screenshot(page, 'northstar-core-goal-hierarchy.png')

        page.get_by_role('button', name='Roadmap', exact=True).first.click()
        phases = page.locator('.roadmap-phase')
        starts = [phase.get_attribute('data-phase-start') for phase in phases.all()]
        assert len(starts) >= 10 and all(starts), starts
        assert starts[1:] == sorted(starts[1:]), 'After the Today anchor, real date order must show US applications before Abitur when appropriate.'
        labels = phases.locator('h2').all_inner_texts()
        for label in ('Q1', 'Q2', 'Q3', 'Q4', 'University preparation', 'Applications', 'Admission', 'University'):
            assert label in labels, labels
        assert any('Abitur' in label for label in labels), labels
        # Attribute selection directly targets the milestone, not its phase.
        item = page.locator(f'.roadmap-item[data-milestone-id={json.dumps(linked["roadmapItemId"])}]')
        expect(item).to_have_count(1)
        progress = item.get_by_role('progressbar')
        before = int(progress.get_attribute('aria-valuenow'))
        check = item.locator('.task-check')
        expect(check).to_have_attribute('aria-pressed', 'false')
        navigate(page, 'Progress')
        initial_pathway = page.locator('.roadmap-progress').filter(has=page.get_by_text('USA', exact=True))
        initial_actions = int(re.search(r'(\d+)/\d+ actions', initial_pathway.inner_text())[1])
        initial_percent = int(page.get_by_role('progressbar', name='USA pathway action progress', exact=True).get_attribute('aria-valuenow'))

        navigate(page, 'Today')
        page.get_by_role('button', name='Complete ' + linked['title'], exact=True).click()
        wait_state(page, f'data.tasks.some(task => task.id === {json.dumps(linked["id"])} && task.completed)')
        assert linked['roadmapItemId'] not in state(page)['roadmapCompleted'], 'Doing an action must not claim an admissions outcome.'
        navigate(page, 'Plan')
        page.get_by_role('button', name='Roadmap', exact=True).first.click()
        assert int(progress.get_attribute('aria-valuenow')) > before
        expect(item.locator('.milestone-step-progress')).to_contain_text('1/')
        expect(check).to_have_attribute('aria-pressed', 'false')
        navigate(page, 'Today')
        row = page.locator('.task-card').filter(has=page.get_by_role('heading', name=linked['title'], exact=True))
        row.get_by_role('button', name='Open ' + linked['title'], exact=True).click()
        expand_details(page.get_by_role('dialog'), 'Why this task')
        page.get_by_role('dialog').get_by_role('button', name='View university roadmap', exact=True).click()
        expect(page.get_by_role('heading', name='Plan', exact=True)).to_be_visible()
        expect(item).to_be_visible()
        assert int(progress.get_attribute('aria-valuenow')) > before
        page.reload()
        page.get_by_role('button', name='Roadmap', exact=True).first.click()
        assert int(progress.get_attribute('aria-valuenow')) > before
        expect(check).to_have_attribute('aria-pressed', 'false')
        navigate(page, 'Progress')
        usa_progress = page.locator('.roadmap-progress').filter(has=page.get_by_text('USA', exact=True))
        recorded_actions = int(re.search(r'(\d+)/\d+ actions', usa_progress.inner_text())[1])
        assert recorded_actions == initial_actions + 1, 'Recorded preparation must advance from the real onboarding baseline.'
        expect(usa_progress).to_contain_text('0/')
        assert int(page.get_by_role('progressbar', name='USA pathway action progress', exact=True).get_attribute('aria-valuenow')) > initial_percent
        expect(page.get_by_role('progressbar', name='Germany pathway action progress', exact=True)).to_have_count(0)
        usa_progress.scroll_into_view_if_needed()
        screenshot(page, 'northstar-core-progress.png')
        no_overflow(page)

    def application_years(self):
        page = self.personal_page()
        navigate(page, 'Profile')
        page.get_by_role('button', name='Edit goals', exact=True).click()
        dialog = page.get_by_role('dialog', name='Your goals')
        dialog.get_by_label('Application year (optional)', exact=True).fill('2029')
        dialog.get_by_label('University entry year (optional)', exact=True).fill('2030')
        dialog.get_by_role('button', name='Save changes', exact=True).click()
        wait_state(page, "String(data.profile.applicationYear) === '2029' && String(data.profile.universityStartYear) === '2030'")
        page.reload()
        expect(page.get_by_text('Application year: 2029 · University entry: 2030', exact=True)).to_be_visible()
        assert str(state(page)['profile']['graduationYear']) == '2028'
        navigate(page, 'Plan')
        page.get_by_role('button', name='Roadmap', exact=True).click()
        applications = page.locator('.roadmap-phase').filter(has=page.get_by_role('heading', name='Applications', exact=True))
        expect(applications.locator('.page-kicker')).to_contain_text('Aug 2029')
        expect(applications.locator('.page-kicker')).to_contain_text('Jul 2030')
        entry = page.locator('.roadmap-phase').filter(has=page.get_by_role('heading', name='University', exact=True))
        expect(entry.locator('.page-kicker')).to_contain_text('Sept 2030')
        page.get_by_role('button', name='Germany', exact=True).click()
        expect(applications.locator('.page-kicker')).to_contain_text('May 2029')
        expect(applications.locator('.page-kicker')).to_contain_text('Sept 2029')
        expect(entry.locator('.page-kicker')).to_contain_text('Sept 2030')
        no_overflow(page)

    def activity_crud(self):
        page = self.personal_page()
        navigate(page, 'Profile')
        page.get_by_role('tab', name='Activities', exact=True).click()
        page.get_by_role('button', name='Add', exact=True).click()
        dialog = page.get_by_role('dialog', name='Add an activity')
        for label, value in [('Activity name', 'Restaurant team leadership'), ('Start date (optional)', '2025-05-01'), ('End date (optional)', '2026-09-30'), ('Hours per week', '6'), ('Weeks per year', '40'), ('What you do', 'Manage shifts and improve the customer experience.'), ('Responsibilities', 'Own weekend staffing and coach new coworkers.'), ('Achievements', 'Organised a reliable weekend rota.'), ('Measurable impact', 'Coordinated 5 coworkers; reduced unfilled shifts from 4 to 1 per month.'), ('Personal notes', 'Keep rota records as evidence of my personal contribution.')]:
            dialog.get_by_label(label, exact=True).fill(value)
        dialog.get_by_label('Type', exact=True).select_option('Work / Entrepreneurship')
        before = state(page)
        dialog.get_by_label('End date (optional)', exact=True).fill('2025-04-01')
        dialog.get_by_role('button', name='Save activity', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('on or after the start date')
        assert state(page) == before
        dialog.get_by_label('End date (optional)', exact=True).fill('2026-09-30')
        dialog.get_by_role('button', name='Save activity', exact=True).click()
        wait_state(page, "data.activities.some(a => a.name === 'Restaurant team leadership' && a.hoursPerWeek === 6 && a.weeksPerYear === 40 && a.endDate === '2026-09-30' && a.responsibilities.includes('staffing') && a.notes.includes('evidence'))")
        page.reload()
        page.get_by_role('tab', name='Activities', exact=True).click()
        expect(page.get_by_text('Coordinated 5 coworkers; reduced unfilled shifts from 4 to 1 per month.', exact=True)).to_be_visible()
        expect(page.get_by_text('Own weekend staffing and coach new coworkers.', exact=True)).to_be_visible()
        page.get_by_role('button', name='Edit Restaurant team leadership', exact=True).click()
        expect(page.get_by_role('dialog').get_by_label('End date (optional)', exact=True)).to_have_value('2026-09-30')
        expect(page.get_by_role('dialog').get_by_label('Personal notes', exact=True)).to_have_value('Keep rota records as evidence of my personal contribution.')
        page.get_by_role('dialog', name='Edit activity').get_by_label('Measurable impact').fill('Coordinated 7 coworkers; independently verified contribution.')
        page.get_by_role('dialog').get_by_role('button', name='Save activity', exact=True).click()
        wait_state(page, "data.activities.some(a => a.impact.includes('7 coworkers'))")
        page.get_by_role('button', name='Remove Restaurant team leadership', exact=True).click()
        page.get_by_role('dialog', name='Remove this activity?').get_by_role('button', name='Remove', exact=True).click()
        wait_state(page, '!data.activities.some(activity => activity.name === "Restaurant team leadership")')

    def university_and_test(self):
        page = self.personal_page()
        navigate(page, 'Profile')
        page.get_by_role('tab', name='Universities', exact=True).click()
        page.get_by_role('button', name='Add', exact=True).click()
        dialog = page.get_by_role('dialog', name='Save a university')
        dialog.get_by_label('University name').fill('KIT')
        dialog.get_by_label('Pathway', exact=True).select_option('Germany')
        dialog.get_by_label('Degree / program').fill('Business Informatics')
        dialog.get_by_label('Verified deadline (optional)').fill('2028-07-15')
        dialog.get_by_label('Requirements, NC & application route').fill('Verify NC, direct application route and Abitur certificate requirements.')
        dialog.get_by_label('Official information link').fill('https://www.kit.edu/')
        dialog.get_by_role('button', name='Save university', exact=True).click()
        wait_state(page, "data.universities.some(u => u.name === 'KIT' && u.country === 'Germany' && u.deadline === '2028-07-15')")
        page.get_by_role('group', name='Filter universities').get_by_role('button', name='Germany', exact=True).click()
        expect(page.get_by_role('heading', name='KIT', exact=True)).to_be_visible()
        expect(page.get_by_role('heading', name='UCLA', exact=True)).to_have_count(0)
        page.get_by_role('tab', name='Goals', exact=True).click()
        page.get_by_role('button', name='Add test plan').click()
        dialog = page.get_by_role('dialog', name='Add an optional test plan')
        dialog.get_by_label('Test', exact=True).select_option('IELTS')
        dialog.get_by_label('Status', exact=True).select_option('Preparing')
        dialog.get_by_label('Target date (optional)').fill('2027-03-15')
        dialog.get_by_label('Target score (optional)').fill('7.5')
        dialog.get_by_label('Requirement / preparation notes').fill('Confirm English proficiency policy for shortlisted universities.')
        dialog.get_by_role('button', name='Save test plan', exact=True).click()
        wait_state(page, "data.profile.testPlans.some(t => t.name === 'IELTS' && t.targetScore === '7.5' && t.status === 'Preparing')")
        page.reload()
        expect(page.get_by_text('Confirm English proficiency policy for shortlisted universities.', exact=True)).to_be_visible()
        assert len(state(page)['grades']) == 0
        navigate(page, 'Plan')
        page.get_by_role('button', name='Events', exact=True).click()
        for title in ('English Klausur', 'KIT: application deadline', 'IELTS'):
            expect(page.locator('.event-card').filter(has=page.get_by_role('heading', name=title, exact=True))).to_be_visible()
        assert state(page).get('events', []) == [], 'Calendar entries must derive from their original records without duplicate storage.'

    def events_change_daily_priorities(self):
        seed = copy.deepcopy(self.personal)
        seed['tasks'] = []
        page = self.new_page(seed=seed)
        navigate(page, 'Plan')
        page.get_by_role('button', name='Events', exact=True).click()
        page.get_by_role('button', name='Add event', exact=True).click()
        dialog = page.get_by_role('dialog', name='Add an event')
        dialog.get_by_label('Event title', exact=True).fill('Restaurant marketing project')
        dialog.get_by_label('Event type', exact=True).select_option('project')
        dialog.get_by_label('Date', exact=True).fill('2026-10-10')
        dialog.get_by_label('Preparation minutes', exact=True).fill('25')
        dialog.get_by_label('Pathway', exact=True).select_option('USA')
        dialog.get_by_label('Priority', exact=True).select_option('high')
        dialog.get_by_label('Notes', exact=True).fill('Deliver a campaign report with verified customer reach and my personal responsibilities.')
        dialog.get_by_role('button', name='Add event', exact=True).click()
        wait_state(page, "data.events.some(event => event.title === 'Restaurant marketing project' && event.date === '2026-10-10')")
        project = next(event for event in state(page)['events'] if event['title'] == 'Restaurant marketing project')
        expect(page.locator('.event-card').filter(has_text='Restaurant marketing project')).to_contain_text('2026')
        navigate(page, 'Today')
        related = [task for task in today_tasks(page) if task.get('eventId') == 'custom:' + project['id']]
        assert len(related) == 1 and related[0]['priority'] == 'high', today_tasks(page)
        assert related[0]['category'] == 'activity' and '2 days' in related[0]['reason']
        assert related[0]['roadmapItemId'] and related[0]['linkedGoal'], 'Deadline work must remain connected to the university roadmap.'
        assert sum(task['minutes'] for task in today_tasks(page)) <= 85
        task = related[0]
        page.get_by_role('button', name='Open ' + task['title'], exact=True).click()
        detail = page.get_by_role('dialog', name='Your next step')
        expect(detail.locator('.exercise-prompt p').first).to_have_text(task['title'])
        assert detail.locator('.practice-step p').all_inner_texts() == task['steps'], 'An event must open its dated preparation action.'
        close_dialog(page)
        page.get_by_role('button', name='Complete ' + task['title'], exact=True).click()
        wait_state(page, f'data.tasks.some(task => task.id === {json.dumps(task["id"])} && task.completed)')
        assert next(event for event in state(page)['events'] if event['id'] == project['id'])['status'] == 'planned', 'Preparation completion must not fabricate project completion.'

        navigate(page, 'Plan')
        page.get_by_role('button', name='Events', exact=True).click()
        page.get_by_role('button', name='Edit Restaurant marketing project', exact=True).click()
        dialog = page.get_by_role('dialog', name='Edit event')
        dialog.get_by_label('Date', exact=True).fill('2027-01-12')
        dialog.get_by_role('button', name='Save event', exact=True).click()
        wait_state(page, "data.events.some(event => event.date === '2027-01-12' && event.title === 'Restaurant marketing project')")
        navigate(page, 'Today')
        assert not any(task.get('eventId') == 'custom:' + project['id'] and not task['completed'] for task in today_tasks(page)), 'A far future milestone should release today’s urgent preparation slot.'
        assert any(saved['id'] == task['id'] and saved['completed'] for saved in state(page)['tasks'])

        navigate(page, 'Plan')
        page.get_by_role('button', name='Events', exact=True).click()
        page.get_by_role('button', name='Add event', exact=True).click()
        dialog = page.get_by_role('dialog', name='Add an event')
        dialog.get_by_label('Event title', exact=True).fill('Engineering internship start')
        dialog.get_by_label('Event type', exact=True).select_option('internship')
        dialog.get_by_label('Date', exact=True).fill('2026-10-09')
        dialog.get_by_label('End date (optional)', exact=True).fill('2026-10-23')
        dialog.get_by_label('Pathway', exact=True).select_option('Both')
        dialog.get_by_label('Notes', exact=True).fill('Confirm supervisor, transport and first-day learning goal.')
        dialog.get_by_role('button', name='Add event', exact=True).click()
        wait_state(page, "data.events.some(event => event.title === 'Engineering internship start' && event.endDate === '2026-10-23')")
        internship = next(event for event in state(page)['events'] if event['title'] == 'Engineering internship start')
        screenshot(page, 'northstar-core-events.png')
        navigate(page, 'Today')
        related = [saved for saved in today_tasks(page) if saved.get('eventId') == 'custom:' + internship['id']]
        assert len(related) == 1 and related[0]['priority'] == 'high'
        assert 'start-day' in related[0]['title'], related
        assert_sessions_free(today_tasks(page))
        navigate(page, 'Plan')
        page.get_by_role('button', name='Events', exact=True).click()
        page.get_by_role('button', name='Edit Engineering internship start', exact=True).click()
        dialog = page.get_by_role('dialog', name='Edit event')
        dialog.get_by_label('Status', exact=True).select_option('completed')
        dialog.get_by_role('button', name='Save event', exact=True).click()
        wait_state(page, f'data.events.some(event => event.id === {json.dumps(internship["id"])} && event.status === "completed")')
        navigate(page, 'Today')
        assert not any(saved.get('eventId') == 'custom:' + internship['id'] and not saved['completed'] for saved in today_tasks(page))

        navigate(page, 'Plan')
        page.get_by_role('button', name='Events', exact=True).click()
        page.get_by_role('button', name='Delete Restaurant marketing project', exact=True).click()
        confirmation = page.get_by_role('dialog', name='Remove this event?')
        confirmation.get_by_role('button', name='Remove event', exact=True).click()
        wait_state(page, f'!data.events.some(event => event.id === {json.dumps(project["id"])})')
        assert any(saved['id'] == task['id'] and saved['completed'] for saved in state(page)['tasks']), 'Deleting a deadline must preserve already recorded effort.'
        assert len(state(page)['exams']) == 1, 'Removing a custom event must leave the exam source intact.'
        page.reload()
        assert not any(event['id'] == project['id'] for event in state(page)['events'])
        no_overflow(page)

    def pathway_preferences_drive_planning(self):
        seed = copy.deepcopy(self.personal)
        seed['tasks'] = []
        seed['universities'] = [
            {'id': 'urgent-usa', 'name': 'UCLA', 'country': 'USA', 'program': 'Explore technology programs', 'deadline': '2026-10-10', 'requirements': 'A test fixture deadline; verify the real application cycle.', 'notes': '', 'url': 'https://admission.ucla.edu/', 'status': 'researching'},
            {'id': 'urgent-germany', 'name': 'KIT', 'country': 'Germany', 'program': 'Business Informatics', 'deadline': '2026-10-10', 'requirements': 'A test fixture deadline; check NC and direct application route.', 'notes': '', 'url': 'https://www.kit.edu/', 'status': 'researching'},
        ]
        page = self.new_page(seed=seed)
        assert any(task.get('eventId') == 'university:urgent-usa' for task in today_tasks(page))
        assert any(task.get('eventId') == 'university:urgent-germany' for task in today_tasks(page))
        navigate(page, 'Profile')
        page.get_by_role('button', name='Edit goals', exact=True).click()
        dialog = page.get_by_role('dialog', name='Your goals')
        dialog.get_by_label('USA', exact=True).uncheck()
        dialog.get_by_label('Germany', exact=True).check()
        dialog.get_by_label('Current school year', exact=True).select_option('Q2')
        dialog.get_by_role('button', name='Save changes', exact=True).click()
        wait_state(page, 'data.profile.pathways.length === 1 && data.profile.pathways[0] === "Germany" && data.profile.schoolYear === "Q2"')
        navigate(page, 'Today')
        tasks = today_tasks(page)
        assert any(task.get('eventId') == 'university:urgent-germany' for task in tasks)
        assert not any(task.get('eventId') == 'university:urgent-usa' for task in tasks), 'An unselected pathway must not consume today’s time.'
        assert all(not task.get('roadmapItemId', '').startswith('USA-') for task in tasks)
        assert sum(task['minutes'] for task in tasks) <= 85
        navigate(page, 'Plan')
        hierarchy = goal_hierarchy(page)
        hierarchy.get_by_text('Year and semester priorities', exact=True).click()
        year_goal = hierarchy.locator('.goal-step').filter(has=page.get_by_text('This year', exact=True))
        year_goal.get_by_role('button', name='Linked university milestones', exact=True).click()
        expect(page.get_by_role('button', name='Germany', exact=True)).to_have_attribute('aria-pressed', 'true')
        expect(page.locator('.roadmap-phase').filter(has=page.get_by_role('heading', name='Q2', exact=True))).to_be_visible()
        page.reload()
        assert state(page)['profile']['pathways'] == ['Germany']
        assert any(university['country'] == 'USA' for university in state(page)['universities']), 'Changing preference must preserve research for a route the user may reconsider.'
        no_overflow(page)

    def backup(self):
        page = self.personal_page()
        navigate(page, 'Profile')
        page.get_by_role('tab', name='Settings', exact=True).click()
        before = state(page)
        with page.expect_download() as pending:
            page.get_by_role('button', name='Export backup', exact=True).click()
        file = RESULTS / 'northstar-coach-export.json'
        pending.value.save_as(str(file))
        exported = json.loads(file.read_text())
        assert exported == before
        file_input = page.get_by_label('Import Northstar backup')
        invalid = copy.deepcopy(exported)
        invalid['subjects'][0]['written'] = 16
        file_input.set_input_files({'name': 'invalid.json', 'mimeType': 'application/json', 'buffer': json.dumps(invalid).encode()})
        expect(page.get_by_role('status')).to_contain_text('This backup could not be opened. Your current plan is unchanged.')
        assert state(page) == before
        expect(page.get_by_role('dialog')).to_have_count(0)
        file_input.set_input_files(str(file))
        dialog = page.get_by_role('dialog', name='Restore your backup?')
        expect(dialog).to_contain_text('replaces the current plan')
        assert state(page) == before
        dialog.get_by_role('button', name='Cancel', exact=True).click()
        assert state(page) == before
        file_input.set_input_files(str(file))
        dialog.get_by_role('button', name='Restore backup', exact=True).click()
        expect(dialog).to_have_count(0)
        assert state(page) == before
        page.reload()
        assert state(page) == before

    def design_and_theme(self):
        page = self.personal_page(mobile=False)
        for label in ('Today', 'Plan', 'Progress', 'Profile'):
            navigate(page, label, mobile=False)
            no_overflow(page)
        page.get_by_role('tab', name='Settings', exact=True).click()
        page.get_by_label('Theme', exact=True).select_option('dark')
        expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
        page.reload()
        expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
        navigate(page, 'Today', mobile=False)
        screenshot(page, 'northstar-coach-desktop-dark.png', full_page=True)
        mobile = self.new_page(seed=state(page))
        for label in ('Today', 'Plan', 'Progress', 'Profile'):
            navigate(mobile, label)
            no_overflow(mobile)
            if label == 'Profile':
                no_tab_label_overlap(mobile)
        nav = mobile.get_by_role('navigation', name='Mobile navigation')
        assert nav.get_by_role('button').count() == 4
        for button in nav.get_by_role('button').all():
            box = button.bounding_box()
            assert box['width'] >= 44 and box['height'] >= 44, box
        mobile.get_by_role('tab', name='Settings', exact=True).click()
        mobile.get_by_label('Theme', exact=True).select_option('light')
        expect(mobile.locator('html')).to_have_attribute('data-theme', 'light')
        navigate(mobile, 'Today')
        mobile.get_by_role('button', name='Adjust available time').click()
        dialog = mobile.get_by_role('dialog')
        no_overflow(mobile)
        mobile.keyboard.press('Tab')
        assert dialog.evaluate('el => el.contains(document.activeElement)')
        mobile.keyboard.press('Escape')
        expect(dialog).to_have_count(0)
        assert mobile.get_by_role('button', name='Adjust available time').evaluate('el => el === document.activeElement')
        header_top = mobile.locator('.mobile-brand').bounding_box()['y']
        navigate(mobile, 'Plan')
        assert abs(mobile.locator('.mobile-brand').bounding_box()['y'] - header_top) < 1

        # Small iPhones retain the same four-tab product and legible cards.
        narrow_seed = state(mobile)
        narrow_seed['profile']['theme'] = 'dark'
        narrow = self.new_page(seed=narrow_seed)
        narrow.set_viewport_size({'width': 320, 'height': 740})
        for label in ('Today', 'Plan', 'Progress', 'Profile'):
            navigate(narrow, label)
            no_overflow(narrow)
        navigate(narrow, 'Today')
        screenshot(narrow, 'northstar-core-320-dark.png', full_page=True)
        navigate(narrow, 'Plan')
        narrow.get_by_role('button', name='Events', exact=True).click()
        no_overflow(narrow)
        narrow.get_by_role('button', name='Add event', exact=True).click()
        no_overflow(narrow)
        close_dialog(narrow)

    def personal_defaults_and_skip(self):
        page = self.new_page()
        page.get_by_role('dialog').get_by_role('button', name='Skip for now', exact=True).click()
        wait_state(page, '!data.demo && data.onboardingCompleted')
        saved = state(page)
        assert saved['profile']['schoolYear'] == 'Q1'
        assert str(saved['profile']['graduationYear']) == '2028'
        assert 'Hessen' in saved['profile']['schoolSystem']
        assert saved['profile']['pathways'] == ['USA', 'Germany']
        expected = {'mathematics': (6, 11), 'english': (None, 7), 'history': (None, 8), 'computer-science': (None, 10), 'politics': (None, 9)}
        for subject_id, values in expected.items():
            subject = next(item for item in saved['subjects'] if item['id'] == subject_id)
            assert (subject['written'], subject['oral']) == values, subject
        assert next(item for item in saved['subjects'] if item['id'] == 'physics')['level'] == 'LK'
        assert saved['exams'] == [] and saved['grades'] == [] and saved['weeklyReviews'] == []
        assert set(activity['name'] for activity in saved['activities']) == {'Volleyball club', 'Restaurant management', 'Social media / marketing', 'Internships'}
        assert all(not activity['achievements'] and not activity['impact'] for activity in saved['activities'])
        volleyball = next(activity for activity in saved['schedule']['fixedActivities'] if activity['title'] == 'Volleyball')
        assert volleyball['days'] == [2, 5]
        assert {university['name'] for university in saved['universities']} == {'UCLA', 'UC Berkeley'}
        assert 0 < len(today_tasks(page)) <= 5
        assert any(task['subjectId'] == 'mathematics' for task in today_tasks(page))
        assert all(not task['completed'] for task in saved['tasks'])
        expect(page.locator('.demo-banner')).to_have_count(0)
        page.reload()
        expect(page.get_by_role('dialog')).to_have_count(0)
        assert state(page) == saved
        navigate(page, 'Profile')
        page.get_by_role('tab', name='Settings', exact=True).click()
        page.get_by_role('button', name='Revisit guided setup', exact=True).click()
        page.get_by_role('dialog').get_by_role('button', name='Continue', exact=True).click()
        expect(page.get_by_role('dialog').get_by_label('Mathematics written points')).to_have_value('6')
        expect(page.get_by_role('dialog').get_by_label('English written points')).to_have_value('')

    def skip_today_replans(self):
        page = self.personal_page()
        before = today_tasks(page)
        task = next(task for task in before if not task['completed'])
        page.get_by_role('button', name='Open ' + task['title'], exact=True).click()
        dialog = page.get_by_role('dialog', name='Your next step')
        dialog.get_by_label('Your work & notes', exact=True).fill('Leave this for another day; today needs a realistic plan.')
        dialog.get_by_role('button', name='Skip for today', exact=True).click()
        expect(dialog).to_have_count(0)
        wait_state(page, f'data.tasks.some(task => task.id === {json.dumps(task["id"])} && task.skipped)')
        skipped = next(item for item in state(page)['tasks'] if item['id'] == task['id'])
        assert not skipped['completed'] and 'realistic plan' in skipped['notes']
        active = [item for item in today_tasks(page) if not item.get('skipped')]
        assert 0 < len(active) <= 5
        assert task['id'] not in {item['id'] for item in active}
        assert sum(item['minutes'] for item in active) <= 85
        assert page.locator('.task-card').count() == len(active)
        assert sum(item['completed'] for item in today_tasks(page)) == sum(item['completed'] for item in before)
        page.reload()
        assert next(item for item in state(page)['tasks'] if item['id'] == task['id'])['skipped']
        expect(page.get_by_role('button', name='Open ' + task['title'], exact=True)).not_to_be_visible()
        expand_details(page, f'Skipped today ({sum(bool(item.get("skipped")) for item in today_tasks(page))})')
        expect(page.get_by_text(task['title'], exact=True)).to_be_visible()
        tomorrow = self.new_page(seed=state(page), clock=datetime(2026, 10, 9, 9, tzinfo=timezone.utc))
        tomorrow_tasks = [item for item in state(tomorrow)['tasks'] if item['date'] == '2026-10-09' and not item.get('skipped')]
        assert 0 < len(tomorrow_tasks) <= 5
        assert task['id'] not in {item['id'] for item in tomorrow_tasks}
        no_overflow(tomorrow)

    def iphone_text_and_keyboard(self):
        # These are layout simulations in Chromium, not a claim that iOS
        # Safari's keyboard or Dynamic Type has been physically tested.
        for width, theme in ((320, 'dark'), (390, 'light'), (402, 'dark'), (430, 'light')):
            seed = copy.deepcopy(self.personal)
            seed['profile']['theme'] = theme
            task = next(item for item in seed['tasks'] if item['date'] == TODAY and not item['completed'])
            task['title'] = 'University preparation — document restaurant-management responsibilities, leadership and measurable results for my application profile'
            page = self.new_page(seed=seed)
            page.set_viewport_size({'width': width, 'height': 844})
            for label in ('Today', 'Plan', 'Progress', 'Profile'):
                navigate(page, label)
                no_overflow(page)
                if label == 'Profile':
                    no_tab_label_overlap(page)
                    tabs = page.get_by_role('tablist', name='Profile sections')
                    tabs.get_by_role('tab', name='Goals', exact=True).focus()
                    page.keyboard.press('End')
                    expect(tabs.get_by_role('tab', name='Settings', exact=True)).to_have_attribute('aria-selected', 'true')
                    expect(page.get_by_label('Theme', exact=True)).to_be_visible()
                    page.keyboard.press('Home')
                    expect(tabs.get_by_role('tab', name='Goals', exact=True)).to_have_attribute('aria-selected', 'true')
                    page.keyboard.press('ArrowLeft')
                    expect(tabs.get_by_role('tab', name='Settings', exact=True)).to_have_attribute('aria-selected', 'true')
                    page.keyboard.press('ArrowRight')
                    expect(tabs.get_by_role('tab', name='Goals', exact=True)).to_have_attribute('aria-selected', 'true')
                nav = page.get_by_role('navigation', name='Mobile navigation')
                for button in nav.get_by_role('button').all():
                    box = button.bounding_box()
                    assert box['width'] >= 44 and box['height'] >= 44, (width, label, box)
                    assert box['y'] >= 0 and box['y'] + box['height'] <= 845, (width, label, box)
            navigate(page, 'Today')
            if width in (320, 390):
                screenshot(page, f'northstar-product-{width}-{theme}.png', full_page=True)

        # Pixel fonts do not respond to changing only the root font size.
        # Snapshot before applying doubled sizes to avoid inheritance doubling
        # repeatedly across children, then verify every main screen independently.
        for label in ('Today', 'Plan', 'Progress', 'Profile'):
            page = self.personal_page()
            navigate(page, label)
            page.evaluate('''() => {
              const sizes=[...document.querySelectorAll('body *')]
                .filter(element => !element.closest('svg'))
                .map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
              for(const [element, size] of sizes) element.style.fontSize=`${size * 2}px`;
            }''')
            no_overflow(page)
            if label == 'Profile':
                no_tab_label_overlap(page)
            nav = page.get_by_role('navigation', name='Mobile navigation')
            assert nav.bounding_box()['height'] < 150, 'Larger text must leave a usable navigation bar.'
            if label == 'Today':
                screenshot(page, 'northstar-product-large-text.png', full_page=True)

        page = self.personal_page()
        navigate(page, 'Profile')
        page.get_by_role('tab', name='Activities', exact=True).click()
        page.get_by_role('button', name='Add', exact=True).click()
        dialog = page.get_by_role('dialog', name='Add an activity')
        page.set_viewport_size({'width': 390, 'height': 430})
        dialog.get_by_label('Activity name', exact=True).fill('Restaurant marketing and team leadership')
        dialog.get_by_label('Personal notes', exact=True).fill('A long note that remains editable when the keyboard reduces the visible screen. ' * 12)
        dialog.get_by_label('Personal notes', exact=True).scroll_into_view_if_needed()
        no_overflow(page)
        close_button = dialog.get_by_role('button', name='Close dialog')
        close_box = close_button.bounding_box()
        assert close_box['width'] >= 44 and close_box['height'] >= 44
        assert 0 <= close_box['y'] <= 386, close_box
        dialog.get_by_role('button', name='Save activity', exact=True).scroll_into_view_if_needed()
        screenshot(page, 'northstar-product-keyboard-sheet.png')
        dialog.get_by_role('button', name='Save activity', exact=True).click()
        wait_state(page, "data.activities.some(activity => activity.name === 'Restaurant marketing and team leadership' && activity.notes.length > 100)")
        page.set_viewport_size({'width': 390, 'height': 844})
        no_overflow(page)

    def empty_states(self):
        seed = copy.deepcopy(self.personal)
        for name in ('subjects', 'activities', 'universities', 'exams', 'events', 'grades', 'tasks', 'weeklyReviews'):
            seed[name] = []
        seed['profile']['testPlans'] = []
        seed['study'] = {'active': None, 'sessions': []}
        seed['schedule']['weekly'] = [{**day, 'minutes': 0} for day in seed['schedule']['weekly']]
        seed['schedule']['timeOverrides'] = []
        page = self.new_page(seed=seed)
        expect(page.locator('.task-card')).to_have_count(0)
        expect(page.get_by_role('button', name='Adjust today’s time', exact=True)).to_be_visible()
        navigate(page, 'Plan')
        page.get_by_role('button', name='Exams', exact=True).click()
        expect(page.get_by_role('button', name='Add exam', exact=True)).to_be_visible()
        page.get_by_role('button', name='Events', exact=True).click()
        expect(page.get_by_role('button', name='Add event', exact=True)).to_be_visible()
        navigate(page, 'Progress')
        expect(page.get_by_role('button', name='Add subjects', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Add exam', exact=True)).to_be_visible()
        navigate(page, 'Profile')
        page.get_by_role('tab', name='Activities', exact=True).click()
        action = page.get_by_role('button', name=re.compile('^Add (an )?activity$', re.I))
        expect(action).to_have_count(1)
        action.click()
        expect(page.get_by_role('dialog', name='Add an activity')).to_be_visible()
        close_dialog(page)
        page.get_by_role('tab', name='Universities', exact=True).click()
        action = page.get_by_role('button', name=re.compile('^Save a university$', re.I))
        expect(action).to_have_count(1)
        action.click()
        expect(page.get_by_role('dialog', name='Save a university')).to_be_visible()
        close_dialog(page)
        no_overflow(page)

    def migration_and_recovery(self):
        legacy = {'version': 1, 'profile': {'name': 'Previous student', 'schoolYear': 'Grade 12', 'schoolSystem': 'Germany public Gymnasium', 'graduationYear': '2028', 'applicationYear': '', 'subjects': 'English, Mathematics', 'dailyMinutes': 60},
            'tasks': [{'id': 'old-task', 'title': 'Saved original completed work', 'date': TODAY, 'category': 'academics', 'minutes': 10, 'completed': True, 'completedAt': '2026-10-08T08:00:00.000Z'}],
            'grades': [{'id': 'old-grade', 'subject': 'English', 'points': 0, 'date': '2026-10-07', 'note': 'Actual earlier zero grade'}], 'reflections': [{'date': '2026-10-07', 'achieved': 'Saved previous reflection', 'next': 'Keep going'}], 'milestones': [], 'generatedPlanDates': [TODAY]}
        page = self.new_page(legacy=legacy)
        wait_state(page, 'data.version === 2 && !data.demo && data.onboardingCompleted')
        migrated = state(page)
        assert migrated['profile']['name'] == 'Previous student'
        assert migrated['profile']['schoolYear'] == 'Q1'
        assert any(t['id'] == 'old-task' and t['completed'] for t in migrated['tasks'])
        assert any(g['id'] == 'old-grade' and g['points'] == 0 for g in migrated['grades'])
        assert migrated['reflections'][0]['achieved'] == 'Saved previous reflection'
        expect(page.get_by_role('alert')).to_contain_text('original remains saved')
        assert page.evaluate('key => localStorage.getItem(key)', LEGACY_KEY) == json.dumps(legacy)
        raw = '{"version":2,"profile": { broken content'
        recovered = self.new_page(raw=raw)
        expect(recovered.get_by_role('alert')).to_contain_text(re.compile(r'original data is (?:safely )?preserved'))
        copies = recovered.evaluate('key => Object.keys(localStorage).filter(k => k.startsWith(key + ".recovery.")).map(k => localStorage.getItem(k))', KEY)
        assert raw in copies
        if recovered.get_by_role('dialog').count():
            recovered.get_by_role('dialog').get_by_role('button', name='Skip for now', exact=True).click()
            wait_state(recovered, 'data.version === 2 && !data.demo && data.onboardingCompleted')
        assert state(recovered)['version'] == 2 and not state(recovered)['demo']
        with recovered.expect_download() as pending:
            recovered.get_by_role('button', name='Download original data', exact=True).click()
        recovery_file = RESULTS / 'northstar-protected-original.txt'
        pending.value.save_as(str(recovery_file))
        assert recovery_file.read_text() == raw
        recovered.reload()
        assert raw in recovered.evaluate('key => Object.keys(localStorage).filter(k => k.startsWith(key + ".recovery.")).map(k => localStorage.getItem(k))', KEY)
        malformed = copy.deepcopy(self.personal)
        malformed['schedule']['weekly'] = {'day': 1, 'minutes': 60}
        nested_raw = json.dumps(malformed)
        nested = self.new_page(raw=nested_raw)
        expect(nested.get_by_role('alert')).to_contain_text('original data is preserved')
        assert nested_raw in nested.evaluate('key => Object.keys(localStorage).filter(k => k.startsWith(key + ".recovery.")).map(k => localStorage.getItem(k))', KEY)
        assert state(nested)['profile']['schoolYear'] == 'Q1'

    def custom_task_capacity(self):
        page = self.personal_page()
        completed_minutes = sum(t['minutes'] for t in today_tasks(page) if t['completed'])
        available = 85 - completed_minutes
        page.get_by_role('button', name='Add an important task', exact=True).click()
        dialog = page.get_by_role('dialog', name='Add an important task')
        dialog.get_by_label('Task name').fill('One important personal project')
        dialog.get_by_label('Estimated minutes').fill(str(available))
        dialog.get_by_role('button', name='Add to plan', exact=True).click()
        wait_state(page, "data.tasks.some(t => t.title === 'One important personal project')")
        assert sum(t['minutes'] for t in today_tasks(page)) <= 85
        before = state(page)
        page.get_by_role('button', name='Add an important task', exact=True).click()
        dialog.get_by_label('Task name').fill('This would overload the day')
        dialog.get_by_label('Estimated minutes').fill('15')
        dialog.get_by_role('button', name='Add to plan', exact=True).click()
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role('alert')).to_contain_text(re.compile('available|remaining|time|budget', re.I))
        assert state(page) == before
        close_dialog(page)
        assert sum(t['minutes'] for t in today_tasks(page)) <= 85
        split = next((t for t in today_tasks(page) if len(t['sessions']) > 1), None)
        if split:
            row = page.locator('.task-card').filter(has=page.get_by_role('heading', name=split['title'], exact=True))
            row.get_by_role('button', name='Open ' + split['title'], exact=True).click()
            displayed = page.get_by_role('dialog').get_by_text(re.compile('^Suggested study blocks')).inner_text()
            assert all(session['start'] in displayed and session['end'] in displayed for session in split['sessions']), displayed
            assert f"{split['start']}–{split['end']}" not in displayed, displayed
            close_dialog(page)

        seed = copy.deepcopy(self.personal)
        seed['tasks'] = []
        limited = self.new_page(seed=seed)
        for index in range(5):
            limited.get_by_role('button', name='Add an important task', exact=True).click()
            form = limited.get_by_role('dialog', name='Add an important task')
            form.get_by_label('Task name', exact=True).fill(f'Chosen priority {index + 1}')
            form.get_by_label('Estimated minutes', exact=True).fill('5')
            form.get_by_role('button', name='Add to plan', exact=True).click()
        assert limited.locator('.task-card').count() == 5
        saved = state(limited)
        limited.get_by_role('button', name='Add an important task', exact=True).click()
        form.get_by_label('Task name', exact=True).fill('A sixth priority would clutter today')
        form.get_by_label('Estimated minutes', exact=True).fill('5')
        form.get_by_role('button', name='Add to plan', exact=True).click()
        expect(form.get_by_role('alert')).to_contain_text('five committed tasks')
        assert state(limited) == saved
        close_dialog(limited)
        no_overflow(limited)

    def partial_revision(self):
        page = self.personal_page()
        completed = next(t for t in today_tasks(page) if t['completed'])
        page.get_by_role('button', name='Undo ' + completed['title'], exact=True).click()
        page.get_by_role('button', name='Adjust available time', exact=True).click()
        dialog = page.get_by_role('dialog', name='Make today realistic')
        dialog.get_by_label('Study allowance (minutes)').fill('5')
        dialog.get_by_role('button', name='Recalculate my day', exact=True).click()
        wait_state(page, "data.schedule.timeOverrides.some(d => d.date === '2026-10-08' && d.minutes === 5)")
        tasks = today_tasks(page)
        assert len(tasks) == 1 and tasks[0]['minutes'] == 5 and tasks[0]['revisionPlanId'], tasks
        task = tasks[0]
        page.get_by_role('button', name='Complete ' + task['title'], exact=True).click()
        wait_state(page, 'data.tasks.some(t => t.completed && t.minutes === 5)')
        navigate(page, 'Plan')
        page.get_by_role('button', name='Exams', exact=True).click()
        exam = page.locator('.exam-card').filter(has_text='English Klausur')
        assert exam.locator('.revision-stage.completed').count() == 0, 'Five minutes must not complete a full 25-minute revision milestone.'
        tomorrow = self.new_page(seed=state(page), clock=datetime(2026, 10, 9, 9, tzinfo=timezone.utc))
        remaining = [t for t in state(tomorrow)['tasks'] if t['date'] == '2026-10-09' and t['revisionPlanId'] == task['revisionPlanId']]
        assert remaining, 'Unfinished milestone should return as useful practice, not disappear.'
        assert remaining[0]['minutes'] <= 20, remaining

        # A lighter review must not turn a real five-minute opportunity into
        # four unusable minutes or park the draft indefinitely.
        lighter_seed = copy.deepcopy(self.personal)
        drafted = next(item for item in lighter_seed['tasks'] if item['completed'] and item['notes'])
        drafted['completed'] = False
        drafted['completedAt'] = None
        lighter_seed['schedule']['timeOverrides'] = [{'date': TODAY, 'minutes': 5}]
        lighter_seed['weeklyReviews'] = [{'weekStart': '2026-09-28', 'reflection': 'Keep next week lighter.', 'focusSubjectId': 'english', 'effort': 'lighter', 'completedAt': '2026-10-04T09:00:00.000Z'}]
        lighter = self.new_page(seed=lighter_seed)
        active = [item for item in today_tasks(lighter) if not item.get('skipped')]
        assert len(active) == 1 and active[0]['minutes'] == 5, active
        assert active[0]['id'] == drafted['id'] and active[0]['notes'] == drafted['notes']
        expect(lighter.locator('.task-card')).to_have_count(1)
        budget = study_budget(lighter)
        assert displayed_minutes(budget.locator('strong').nth(0).inner_text()) == 5
        assert displayed_minutes(budget.locator('strong').nth(1).inner_text()) == 5
        lighter.reload()
        restored = next(item for item in today_tasks(lighter) if item['id'] == drafted['id'])
        assert restored['minutes'] == 5 and restored['notes'] == drafted['notes'] and not restored.get('skipped')

    def missed_work(self):
        page = self.new_page(seed=copy.deepcopy(self.personal), clock=datetime(2026, 10, 9, 9, tzinfo=timezone.utc))
        expect(page.locator('.today-date')).to_contain_text(re.compile('Friday,? 9 October'))
        wait_state(page, "data.tasks.some(t => t.date === '2026-10-09')")
        saved = state(page)
        tasks = [t for t in saved['tasks'] if t['date'] == '2026-10-09']
        assert 3 <= len(tasks) <= 5, tasks
        assert sum(t['minutes'] for t in tasks) <= 75
        assert len({t['title'] for t in tasks}) == len(tasks)
        assert all(not t['completed'] for t in tasks)
        assert any(t['id'] == self.personal['tasks'][0]['id'] for t in saved['tasks'])
        assert len([t for t in saved['tasks'] if t['completed']]) == 1
        assert page.locator('.task-card').count() <= 5
        no_overflow(page)

    def saved_history(self):
        seed = copy.deepcopy(self.personal)
        seed['createdDate'] = '2026-10-05'
        historical = []
        for index, original in enumerate(seed['tasks']):
            task = copy.deepcopy(original)
            task.update(id=f'historical-{index}', date='2026-10-06',
                title=f'Historical action {index + 1}: {original["title"]}',
                examId='', revisionStage='', revisionPlanId='',
                completed=index == 0, completedAt='2026-10-06T15:00:00.000Z' if index == 0 else None,
                notes='Saved work before the current settings changed.' if index == 0 else '')
            historical.append(task)
        seed['tasks'].extend(historical)
        page = self.new_page(seed=seed)
        recorded = [task for task in state(page)['tasks'] if task['date'] == '2026-10-06']
        assert len(recorded) >= 3 and any(task['completed'] for task in recorded)
        assert any(not task['completed'] for task in recorded)
        navigate(page, 'Profile')
        page.get_by_role('tab', name='Subjects', exact=True).click()
        page.get_by_role('button', name='Edit English', exact=True).click()
        dialog = page.get_by_role('dialog', name='Edit subject')
        dialog.get_by_label('Written points', exact=True).fill('0')
        dialog.get_by_label('Target points', exact=True).fill('15')
        dialog.get_by_label('Weak topics', exact=True).fill('new weak topic after this historical day')
        dialog.get_by_role('button', name='Save changes', exact=True).click()
        wait_state(page, "data.subjects.some(s => s.id === 'english' && s.written === 0 && s.target === 15)")
        navigate(page, 'Plan')
        page.get_by_role('button', name='Schedule', exact=True).click()
        page.get_by_label('Tuesday study minutes', exact=True).fill('0')
        page.get_by_role('button', name='Save weekly timetable', exact=True).click()
        wait_state(page, 'data.schedule.weekly.some(day => day.day === 2 && day.minutes === 0)')
        page.get_by_role('button', name='Week', exact=True).click()
        page.get_by_role('button', name='Tuesday 6 October', exact=True).click()
        card = page.locator('.plan-screen .card').first
        for task in recorded:
            expect(card.get_by_text(task['title'], exact=True)).to_be_visible()
        assert card.locator('.list-row').count() == len(recorded)
        page.get_by_role('button', name='Open day', exact=True).click()
        expect(page.get_by_role('heading', name='Tuesday', exact=True)).to_be_visible()
        expect(page.locator('.page-kicker').first).to_have_text('YOUR HISTORY')
        assert page.locator('.task-card').count() == len(recorded)
        for task in recorded:
            expect(page.get_by_role('heading', name=task['title'], exact=True)).to_be_visible()
        assert [task for task in state(page)['tasks'] if task['date'] == '2026-10-06'] == recorded
        expect(page.get_by_role('button', name='Adjust available time', exact=True)).to_have_count(0)
        page.get_by_role('button', name='Back to today', exact=True).click()
        navigate(page, 'Plan')
        page.get_by_role('button', name='Previous week', exact=True).click()
        page.get_by_role('button', name='Monday 28 September', exact=True).click()
        expect(page.get_by_role('heading', name='No recorded plan', exact=True)).to_be_visible()
        assert page.locator('.plan-screen .card').first.locator('.list-row').count() == 0
        page.get_by_role('button', name='Open day', exact=True).click()
        expect(page.get_by_role('heading', name='Monday', exact=True)).to_be_visible()
        expect(page.get_by_role('heading', name='No recorded plan', exact=True)).to_be_visible()
        assert page.locator('.task-card').count() == 0
        assert not any(task['date'] == '2026-09-28' for task in state(page)['tasks'])
        assert [task for task in state(page)['tasks'] if task['date'] == '2026-10-06'] == recorded
        no_overflow(page)

    def focus_pause_resume(self):
        seed = copy.deepcopy(self.personal)
        seed['study'] = {'active': None, 'sessions': []}
        for task in seed['tasks']:
            task['completed'] = False
            task['completedAt'] = None
        page = self.new_page(seed=seed, timer_clock=True)
        task = next(task for task in today_tasks(page) if not task['completed'])
        completed_before = sum(task['completed'] for task in state(page)['tasks'])
        page.get_by_role('button', name='Open ' + task['title'], exact=True).click()
        page.get_by_role('dialog', name='Your next step').get_by_role('button', name='Start focus session', exact=True).click()
        dialog = page.get_by_role('dialog', name='Focus session')
        wait_state(page, f'data.study.active && data.study.active.taskId === {json.dumps(task["id"])}')
        no_overflow(page)
        for label in ('Pause focus', 'Finish & save'):
            bounds = dialog.get_by_role('button', name=label, exact=True).bounding_box()
            assert bounds['width'] >= 44 and bounds['height'] >= 44, bounds
        session_id = state(page)['study']['active']['id']
        page.clock.run_for(125000)
        dialog.get_by_role('button', name='Pause focus', exact=True).click()
        wait_state(page, 'data.study.active && data.study.active.runningSince === null')
        paused = copy.deepcopy(state(page)['study']['active'])
        assert len(paused['intervals']) == 1
        pause_seconds = (datetime.fromisoformat(paused['intervals'][0]['end'].replace('Z', '+00:00')) -
            datetime.fromisoformat(paused['intervals'][0]['start'].replace('Z', '+00:00'))).total_seconds()
        assert pause_seconds == 125, paused
        close_dialog(page)
        page.clock.run_for(180000)
        assert state(page)['study']['active'] == paused, 'A pause must never become measured study time.'
        page.reload()
        expect(page.get_by_role('complementary', name='Active focus session')).to_be_visible()
        no_overflow(page)
        assert state(page)['study']['active'] == paused
        page.get_by_role('button', name='Open focus timer', exact=True).click()
        dialog.get_by_role('button', name='Resume focus', exact=True).click()
        wait_state(page, 'data.study.active && data.study.active.runningSince !== null')
        page.clock.run_for(65000)
        dialog.get_by_role('button', name='Finish & save', exact=True).click()
        wait_state(page, 'data.study.active === null && data.study.sessions.length === 1')
        saved = state(page)
        session = saved['study']['sessions'][0]
        assert session['id'] == session_id and session['taskId'] == task['id']
        assert session['seconds'] == 190, session
        assert len(session['intervals']) == 2
        assert sum(task['completed'] for task in saved['tasks']) == completed_before, 'A timer session is effort, not an automatic completed assignment.'
        close_dialog(page)
        navigate(page, 'Progress')
        measured = page.get_by_role('region', name='Timed study')
        expect(measured.get_by_test_id('timed-study-total')).to_have_text('3 min 10s')
        expect(measured.get_by_test_id('timed-study-session-count')).to_have_text('1 session')
        stats = page.locator('.stats-grid').first
        expect(stats.locator('.stat').nth(0)).to_contain_text('0 /')
        expect(stats.locator('.stat').nth(1)).to_contain_text('0 min')
        expect(stats.locator('.stat').nth(2).locator('.metric')).to_have_text('1/7')
        expect(page.locator('.consistency-day[title^="Thursday:"]')).to_have_attribute('title', 'Thursday: 0 completed tasks · 3 min 10s timed study')
        page.reload()
        assert state(page)['study']['sessions'] == saved['study']['sessions'], 'Reload must not duplicate a saved session.'
        expand_details(measured, 'Focus history')
        measured.get_by_role('button', name=re.compile('^Delete timed session ')).click()
        page.get_by_role('dialog', name='Remove this study session?').get_by_role('button', name='Remove session', exact=True).click()
        wait_state(page, 'data.study.sessions.length === 0')
        expect(stats.locator('.stat').nth(2).locator('.metric')).to_have_text('0/7')
        expect(page.locator('.consistency-dot.completed')).to_have_count(0)
        assert sum(task['completed'] for task in state(page)['tasks']) == 0
        no_overflow(page)

    def focus_background_cap(self):
        seed = copy.deepcopy(self.personal)
        seed['study'] = {'active': None, 'sessions': []}
        page = self.new_page(seed=seed, timer_clock=True)
        task = next(task for task in today_tasks(page) if not task['completed'])
        page.get_by_role('button', name='Open ' + task['title'], exact=True).click()
        page.get_by_role('dialog').get_by_role('button', name='Start focus session', exact=True).click()
        wait_state(page, '!!data.study.active')
        active = state(page)['study']['active']
        start = datetime.fromisoformat(active['runningSince'].replace('Z', '+00:00'))
        page.clock.set_system_time(start + timedelta(seconds=active['targetSeconds'] + 3600))
        page.reload()
        wait_state(page, 'data.study.active === null && data.study.sessions.length === 1')
        saved = state(page)
        session = saved['study']['sessions'][0]
        assert session['id'] == active['id'] and session['seconds'] == active['targetSeconds'], session
        assert not next(t for t in saved['tasks'] if t['id'] == task['id'])['completed']
        page.reload()
        assert state(page)['study']['sessions'] == saved['study']['sessions']
        expect(page.get_by_role('complementary', name='Active focus session')).to_have_count(0)
        navigate(page, 'Progress')
        expect(page.get_by_role('region', name='Timed study').get_by_test_id('timed-study-total')).to_have_text(f"{active['targetSeconds'] // 60} min")
        no_overflow(page)

    def focus_switch_task(self):
        seed = copy.deepcopy(self.personal)
        seed['study'] = {'active': None, 'sessions': []}
        page = self.new_page(seed=seed, timer_clock=True)
        first, second = [task for task in today_tasks(page) if not task['completed']][:2]
        page.get_by_role('button', name='Open ' + first['title'], exact=True).click()
        page.get_by_role('dialog').get_by_role('button', name='Start focus session', exact=True).click()
        wait_state(page, '!!data.study.active')
        first_active = copy.deepcopy(state(page)['study']['active'])
        page.clock.run_for(65000)
        close_dialog(page)
        page.get_by_role('button', name='Open ' + second['title'], exact=True).click()
        page.get_by_role('dialog').get_by_role('button', name='Start focus session', exact=True).click()
        conflict = page.get_by_role('dialog', name='One focus session at a time')
        expect(conflict).to_be_visible()
        assert state(page)['study']['active']['id'] == first_active['id']
        conflict.get_by_role('button', name='Keep current session', exact=True).click()
        expect(page.get_by_role('dialog', name='Focus session')).to_be_visible()
        assert state(page)['study']['active']['id'] == first_active['id'] and not state(page)['study']['sessions']
        close_dialog(page)
        page.get_by_role('button', name='Open ' + second['title'], exact=True).click()
        page.get_by_role('dialog').get_by_role('button', name='Start focus session', exact=True).click()
        conflict.get_by_role('button', name='Save & switch tasks', exact=True).click()
        wait_state(page, f'data.study.active && data.study.active.taskId === {json.dumps(second["id"])} && data.study.sessions.length === 1')
        switched = state(page)['study']
        assert switched['sessions'][0]['id'] == first_active['id'] and switched['sessions'][0]['seconds'] == 65
        assert switched['sessions'][0]['intervals'][-1]['end'] <= switched['active']['runningSince'], switched
        assert switched['active']['id'] != first_active['id']
        page.clock.run_for(30000)
        page.get_by_role('dialog', name='Focus session').get_by_role('button', name='Finish & save', exact=True).click()
        wait_state(page, 'data.study.active === null && data.study.sessions.length === 2')
        final = state(page)['study']['sessions']
        assert [session['seconds'] for session in final] == [65, 30]
        assert len({session['id'] for session in final}) == 2
        assert not next(task for task in state(page)['tasks'] if task['id'] == second['id'])['completed']
        page.get_by_role('dialog', name='Session saved').get_by_role('button', name='Complete task', exact=True).click()
        wait_state(page, f'data.tasks.some(t => t.id === {json.dumps(second["id"])} && t.completed)')
        expect(page.get_by_role('dialog')).to_have_count(0)
        navigate(page, 'Progress')
        measured = page.get_by_role('region', name='Timed study')
        expect(measured.get_by_test_id('timed-study-total')).to_have_text('1 min 35s')
        expand_details(measured, 'Focus history')
        row = measured.locator('.timed-study-row').filter(has_text=second['title'])
        row.get_by_role('button', name=re.compile('^Delete timed session ')).click()
        confirmation = page.get_by_role('dialog', name='Remove this study session?')
        confirmation.get_by_role('button', name='Keep session', exact=True).click()
        assert state(page)['study']['sessions'] == final
        row.get_by_role('button', name=re.compile('^Delete timed session ')).click()
        confirmation.get_by_role('button', name='Remove session', exact=True).click()
        wait_state(page, 'data.study.sessions.length === 1')
        expect(measured.get_by_test_id('timed-study-total')).to_have_text('1 min 5s')
        expect(measured.get_by_test_id('timed-study-session-count')).to_have_text('1 session')
        assert state(page)['study']['sessions'][0] == final[0]
        assert next(task for task in state(page)['tasks'] if task['id'] == second['id'])['completed'], 'Correcting a timer log must preserve independently reported task completion.'
        page.reload()
        assert state(page)['study']['sessions'] == [final[0]]
        no_overflow(page)

    def rotating_practice_and_self_review(self):
        seed = copy.deepcopy(self.personal)
        template = copy.deepcopy(next(task for task in seed['tasks'] if task['date'] == TODAY and not task['completed']))
        template.update(id='personal-english-summary', date=TODAY, title='English — summary practice',
            category='language', subjectId='english', examId='', goalId='language', minutes=20,
            priority='high', reason='Improve clear English summaries using your own words.',
            steps=['Read the whole text.', 'Write a short summary.', 'Check the meaning and structure.'],
            resource='', completed=False, completedAt=None, notes='', selfReview=[],
            origin='custom', revisionStage='', revisionPlanId='', planSignature='')
        seed['tasks'].append(template)
        page = self.new_page(seed=seed)
        page.get_by_role('button', name='Open ' + template['title'], exact=True).click()
        dialog = page.get_by_role('dialog', name='Your next step')
        passage = dialog.locator('.practice-passage').first.locator('p').inner_text()
        assert len(passage) > 200, 'A writing task needs actual source material.'
        review = dialog.get_by_role('group', name='Self-review', exact=True)
        checkboxes = review.get_by_role('checkbox')
        assert checkboxes.count() >= 3
        first_label = checkboxes.first.get_attribute('aria-label')
        checkboxes.first.check()
        wait_state(page, 'data.tasks.some(t => t.id === "personal-english-summary" && t.selfReview.length === 1)')
        draft = 'The text describes a change in access to opportunities and explains its effects.'
        dialog.get_by_label('Your work & notes').fill(draft)
        wait_state(page, f'data.tasks.some(t => t.id === "personal-english-summary" && t.notes === {json.dumps(draft)})')
        example = dialog.locator('details').filter(has=page.get_by_text('See an example response', exact=True))
        expect(example).to_have_count(1)
        expect(example.locator('p')).not_to_be_visible()
        example.get_by_text('See an example response', exact=True).click()
        expect(example.locator('p')).to_be_visible()
        assert len(example.locator('p').inner_text()) > 80
        close_dialog(page)
        saved = state(page)
        assert saved['grades'] == seed['grades'], 'A checked rubric is self-review, not a fabricated grade.'
        assert saved['subjects'] == seed['subjects']
        assert not next(task for task in saved['tasks'] if task['id'] == template['id'])['completed']
        page.reload()
        page.get_by_role('button', name='Open ' + template['title'], exact=True).click()
        expect(dialog.get_by_label(first_label, exact=True)).to_be_checked()
        expect(dialog.get_by_label('Your work & notes')).to_have_value(draft)
        expect(dialog.locator('details').filter(has=page.get_by_text('See an example response', exact=True)).locator('p')).not_to_be_visible()
        no_overflow(page)

        tomorrow_seed = copy.deepcopy(seed)
        next(task for task in tomorrow_seed['tasks'] if task['id'] == template['id'])['date'] = '2026-10-09'
        tomorrow = self.new_page(seed=tomorrow_seed, clock=datetime(2026, 10, 9, 9, tzinfo=timezone.utc))
        tomorrow.get_by_role('button', name='Open ' + template['title'], exact=True).click()
        next_passage = tomorrow.get_by_role('dialog').locator('.practice-passage').first.locator('p').inner_text()
        assert next_passage != passage, 'The same writing skill should use a new source on the following day.'
        assert len(next_passage) > 200
        no_overflow(tomorrow)

    def production_offline(self):
        page = self.personal_page()
        page.evaluate('() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((_,reject) => setTimeout(() => reject(new Error(\"Service worker was not ready within 10 seconds\")),10000))])')
        page.wait_for_function('!!navigator.serviceWorker.controller')
        assets = page.evaluate('''async () => { const keys=await caches.keys(); const result=[];
          for(const key of keys) for(const request of await (await caches.open(key)).keys()) result.push(request.url); return result; }''')
        assert any('/assets/' in asset and asset.endswith('.js') for asset in assets), assets
        assert any(asset.endswith('.woff2') for asset in assets), assets
        saved = state(page)
        page.context.set_offline(True)
        page.reload()
        expect(page.get_by_role('heading', name='Today', exact=True)).to_be_visible()
        assert state(page) == saved
        navigate(page, 'Plan')
        expect(page.get_by_text('The bigger picture', exact=True)).to_be_visible()
        navigate(page, 'Progress')
        expect(page.get_by_text('Subject grades', exact=True)).to_be_visible()
        no_overflow(page)
        page.context.set_offline(False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:4173')
    parser.add_argument('--production', action='store_true')
    args = parser.parse_args()
    RESULTS.mkdir(exist_ok=True)
    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        suite = Suite(browser, args.url, args.production)
        for name, run in [
            ('personal onboarding creates useful bounded priorities', suite.onboarding),
            ('task exercise, notes, completion and progress persist', suite.complete_and_notes),
            ('exam CRUD creates staged revision and future priorities', suite.exam_crud),
            ('weekly timetable excludes fixed activity and zero means rest', suite.schedule_and_rest),
            ('45-minute and three-hour days preserve urgent priorities within free time', suite.realistic_day_priorities),
            ('subject target gaps and zero grade update planning', suite.subjects_and_zero_grade),
            ('weekly review changes next week and Sunday offers reset', suite.weekly_review),
            ('USA and Germany roadmap completion persists independently', suite.roadmap),
            ('year and semester roadmap priorities become daily actions and real milestone progress', suite.roadmap_to_daily_action),
            ('application and entry years move both university pathways', suite.application_years),
            ('application activity full CRUD preserves measurable impact', suite.activity_crud),
            ('German degree/deadline and optional IELTS tracking persist', suite.university_and_test),
            ('unified project and internship events automatically change today without fabricating outcomes', suite.events_change_daily_priorities),
            ('pathway and school-year preferences change priorities while retaining university research', suite.pathway_preferences_drive_planning),
            ('backup roundtrip rejects malformed records without data loss', suite.backup),
            ('mobile/desktop navigation, light/dark, focus and layout', suite.design_and_theme),
            ('first launch and skipped setup use known profile without invented achievements', suite.personal_defaults_and_skip),
            ('skipping today preserves notes and recalculates without a backlog', suite.skip_today_replans),
            ('iPhone widths, doubled text and keyboard-height sheets stay usable', suite.iphone_text_and_keyboard),
            ('empty screens offer one clear next action without crashing', suite.empty_states),
            ('old data migrates and corrupt originals are protected', suite.migration_and_recovery),
            ('manual priorities respect remaining capacity and split sessions display honestly', suite.custom_task_capacity),
            ('partial revision remains unfinished until the full milestone is studied', suite.partial_revision),
            ('missed work produces a balanced new day without a backlog', suite.missed_work),
            ('saved history survives new grades and schedules without invented past plans', suite.saved_history),
            ('focus pause, resume, reload and exact measured time save once', suite.focus_pause_resume),
            ('background focus recovery caps the target without completing the task', suite.focus_background_cap),
            ('switching focus tasks saves once and never overlaps sessions', suite.focus_switch_task),
            ('daily writing material rotates and honest self-review persists', suite.rotating_practice_and_self_review),
        ]:
            case(results, name, run)
        if args.production:
            case(results, 'production shell, fonts and personal flow work offline', suite.production_offline)
        case(results, 'zero uncaught browser errors across all flows', lambda: (_ for _ in ()).throw(AssertionError(suite.errors)) if suite.errors else None)
        case(results, 'zero browser console errors across all flows', lambda: (_ for _ in ()).throw(AssertionError(suite.console_errors)) if suite.console_errors else None)
        for context in suite.contexts:
            context.close()
        browser.close()
    report = {'url': args.url, 'production': args.production, 'clock': FIXED_TIME.isoformat(), 'results': results}
    (RESULTS / 'browser-smoke.json').write_text(json.dumps(report, indent=2))
    failed = [result for result in results if not result['passed']]
    print(f'{len(results) - len(failed)} / {len(results)} cases passed', flush=True)
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
