"""Real-browser smoke coverage for the Northstar planning prototype.

Run a production preview first, then:
    python tests/browser_smoke.py --url http://127.0.0.1:4173

Uses Python Playwright and an installed Chromium. Threshold checks seed an
elapsed start timestamp, then exercise the real timer and reflection UI.
They make no claim about native iOS Screen Time behavior.
"""

import argparse
import json
import re
import sys
import time
import traceback
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


DATA_KEY = "northstar.data.v1"
FOCUS_KEY = "northstar.focus.v1"
RESULTS = Path(__file__).resolve().parents[1] / "test-results"


def data(page):
    return page.evaluate("key => JSON.parse(localStorage.getItem(key))", DATA_KEY)


def wait_data(page, expression):
    page.wait_for_function(
        f"key => {{ const data = JSON.parse(localStorage.getItem(key)); return {expression}; }}",
        arg=DATA_KEY,
    )


def visit(page, url, tab="today"):
    page.goto(f"{url}/#{tab}")
    expect(page.locator("h1")).to_be_visible()


def navigate(page, label, mobile=False):
    nav = page.get_by_role("navigation", name="Mobile navigation" if mobile else "Main navigation")
    nav.get_by_role("button", name=label, exact=True).click()
    expect(page.locator("h1")).to_be_visible()


def assert_no_overflow(page):
    widths = page.evaluate("""() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    })""")
    assert widths["document"] <= widths["viewport"] + 1, widths
    assert widths["body"] <= widths["viewport"] + 1, widths


def semantic_snapshot(value):
    return {key: value.get(key) for key in (
        "version", "profile", "tasks", "grades", "reflections", "milestones", "generatedPlanDates"
    )}


def record_case(results, name, function):
    started = time.monotonic()
    try:
        function()
        results.append({"name": name, "passed": True, "seconds": round(time.monotonic() - started, 2)})
        print(f"PASS {name}", flush=True)
    except Exception as error:
        results.append({"name": name, "passed": False, "seconds": round(time.monotonic() - started, 2), "error": str(error)})
        print(f"FAIL {name}: {error}", flush=True)
        traceback.print_exc()


def desktop_suite(browser, url, results):
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, timezone_id="Europe/Berlin", accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def initial():
        visit(page, url)
        expect(page.get_by_role("heading", name="Your daily plan")).to_be_visible()
        state = data(page)
        assert len(state["tasks"]) >= 4, state["tasks"]
        assert all(not task["completed"] for task in state["tasks"])
        assert state["reflections"] == []
        assert state["grades"] == []
        assert state["profile"]["schoolYear"] == "Grade 12", state["profile"]
        assert "Germany" in state["profile"]["schoolSystem"]
        assert "Gymnasium" in state["profile"]["schoolSystem"]
        assert state["profile"]["graduationYear"] == "2028"
        assert state["profile"]["applicationYear"] == ""
        assert_no_overflow(page)
        page.screenshot(path=str(RESULTS / "northstar-desktop.png"), full_page=True)
        for label in ["My pathway", "My progress", "Focus space", "Today"]:
            navigate(page, label)
            assert_no_overflow(page)
        assert errors == [], errors

    def checklist():
        visit(page, url)
        checkbox = page.locator(".task-row .task-check").first
        task_title = page.locator(".task-row .task-title").first.inner_text()
        checkbox.click()
        expect(checkbox).to_have_attribute("aria-pressed", "true")
        wait_data(page, f"data.tasks.some(task => task.title === {json.dumps(task_title)} && task.completed && task.completedAt)")
        page.reload()
        expect(page.get_by_role("button", name=f"Mark incomplete: {task_title}", exact=True)).to_have_attribute("aria-pressed", "true")
        navigate(page, "My progress")
        for label in ["Steps taken today", "Steps this month", "Steps, all time"]:
            expect(page.locator(".stat-card").filter(has=page.get_by_role("heading", name=label, exact=True)).locator(".stat-number")).to_have_text("1")

    def add_tasks():
        visit(page, url)
        page.get_by_role("button", name="Add a task", exact=True).click()
        dialog = page.get_by_role("dialog", name="One small step.")
        dialog.get_by_label("What will you do?").fill("Review chemistry mistakes — browser check")
        dialog.get_by_label("Area of your life").select_option("academics")
        dialog.get_by_label("Minutes", exact=True).fill("25")
        planned_date = dialog.get_by_label("Plan for").input_value()
        dialog.get_by_role("button", name="Add to my plan").click()
        expect(page.locator(".task-row").filter(has_text="Review chemistry mistakes — browser check")).to_be_visible()
        wait_data(page, "data.tasks.some(task => task.title === 'Review chemistry mistakes — browser check' && task.category === 'academics' && task.minutes === 25)")
        added = next(task for task in data(page)["tasks"] if task["title"] == "Review chemistry mistakes — browser check")
        assert added["date"] == planned_date
        assert added["completed"] is False
        page.locator(".task-tabs").get_by_role("button", name="Activities", exact=True).click()
        expect(page.locator(".task-row").filter(has_text=added["title"])).to_have_count(0)
        page.locator(".task-tabs").get_by_role("button", name="All tasks", exact=True).click()
        page.get_by_role("button", name="Add a task", exact=True).click()
        dialog.get_by_label("What will you do?").fill("Project conversation tomorrow — browser check")
        dialog.get_by_label("Area of your life").select_option("activities")
        tomorrow = page.evaluate("""() => { const d=new Date(); d.setDate(d.getDate()+1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }""")
        dialog.get_by_label("Plan for").fill(tomorrow)
        dialog.get_by_role("button", name="Add to my plan").click()
        expect(page.locator(".task-row").filter(has_text="Project conversation tomorrow — browser check")).to_have_count(0)
        tomorrow_label = page.evaluate("key => new Date(`${key}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})", tomorrow)
        tomorrow_button = page.locator(".week-strip").get_by_role("button", name=tomorrow_label, exact=True)
        if tomorrow_button.count() == 0:
            page.get_by_role("button", name="Next week", exact=True).click()
        tomorrow_button.click()
        expect(page.locator(".task-row").filter(has_text="Project conversation tomorrow — browser check")).to_be_visible()
        page.reload()
        wait_data(page, f"data.tasks.some(task => task.title === 'Project conversation tomorrow — browser check' && task.date === {json.dumps(tomorrow)} && task.category === 'activities')")

    def reflection():
        visit(page, url)
        page.get_by_label("What are you proud of today?").fill("I explained a chemistry concept in English.")
        page.get_by_label("What’s your next small step?").fill("Practice recalling the explanation tomorrow.")
        page.get_by_text("Make room for gratitude", exact=False).click()
        page.get_by_label("What are you grateful for?").fill("My classmate listened and helped.")
        page.get_by_role("button", name="Save reflection", exact=False).click()
        wait_data(page, "data.reflections.some(entry => entry.achieved === 'I explained a chemistry concept in English.')")
        page.reload()
        expect(page.get_by_label("What are you proud of today?")).to_have_value("I explained a chemistry concept in English.")
        navigate(page, "My progress")
        expect(page.locator(".journal-entry").get_by_text("I explained a chemistry concept in English.", exact=True)).to_be_visible()
        expect(page.locator(".journal-entry").get_by_text("Practice recalling the explanation tomorrow.", exact=True)).to_be_visible()

    def profile():
        visit(page, url)
        page.get_by_role("button", name="Edit your profile", exact=True).click()
        dialog = page.get_by_role("dialog", name="A plan that feels like you.")
        expect(dialog.get_by_label("School year / grade")).to_have_value("Grade 12")
        expect(dialog.get_by_label("Intended application year")).to_have_value("")
        expect(dialog.get_by_label("Abitur / graduation year")).to_have_value("2028")
        dialog.get_by_label("Your first name").fill("Alex")
        dialog.get_by_label("Subjects that need attention").fill("Chemistry, English, German")
        dialog.get_by_label("Daily planning budget").select_option("90")
        dialog.get_by_label("Interests or possible major").fill("Environmental science")
        dialog.get_by_role("button", name="Save my profile").click()
        wait_data(page, "data.profile.name === 'Alex' && data.profile.dailyMinutes === 90")
        page.reload()
        page.get_by_role("button", name="Edit your profile", exact=True).click()
        expect(dialog.get_by_label("Your first name")).to_have_value("Alex")
        expect(dialog.get_by_label("Subjects that need attention")).to_have_value("Chemistry, English, German")
        expect(dialog.get_by_label("Daily planning budget")).to_have_value("90")
        expect(dialog.get_by_label("Interests or possible major")).to_have_value("Environmental science")
        page.get_by_role("button", name="Close dialog").click()

    def milestones():
        visit(page, url, "pathway")
        milestone = page.locator(".milestone").first
        title = milestone.locator("h3").inner_text()
        milestone.locator(".task-check").click()
        expect(milestone.locator(".task-check")).to_have_attribute("aria-pressed", "true")
        milestone.get_by_role("button", name=f"Add to today: {title}", exact=True).click()
        wait_data(page, f"data.tasks.some(task => task.title === {json.dumps(title)}) && data.milestones.some(item => item.title === {json.dumps(title)} && item.completed)")
        page.reload()
        expect(page.get_by_role("button", name=f"Uncomplete milestone: {title}", exact=True)).to_have_attribute("aria-pressed", "true")
        navigate(page, "Today")
        expect(page.locator(".task-row").filter(has_text=title)).to_be_visible()

    def grades():
        visit(page, url, "progress")
        page.get_by_role("button", name="Record a grade", exact=True).click()
        dialog = page.get_by_role("dialog")
        dialog.locator("#grade-subject").fill("English")
        points = dialog.locator("#grade-points")
        points.fill("16")
        assert points.evaluate("input => !input.checkValidity()"), "Grades above 15 must be invalid"
        points.fill("-1")
        assert points.evaluate("input => !input.checkValidity()"), "Grades below zero must be invalid"
        points.fill("12")
        dialog.locator("#grade-note").fill("English essay — browser check")
        dialog.get_by_role("button", name=re.compile(r"Save grade|Add grade|Record grade", re.I)).click()
        wait_data(page, "data.grades.some(grade => grade.subject === 'English' && grade.points === 12 && grade.note === 'English essay — browser check')")
        page.reload()
        expect(page.get_by_text("English essay — browser check", exact=True)).to_be_visible()
        page.get_by_role("button", name="Record a grade", exact=True).click()
        dialog.locator("#grade-subject").fill("Math")
        dialog.locator("#grade-points").fill("0")
        dialog.get_by_role("button", name=re.compile(r"Save grade|Add grade|Record grade", re.I)).click()
        wait_data(page, "data.grades.some(grade => grade.subject === 'Math' && grade.points === 0)")

    def backup_roundtrip():
        visit(page, url)
        before = semantic_snapshot(data(page))
        with page.expect_download() as download_info:
            page.get_by_role("button", name="Export backup", exact=True).click()
        destination = RESULTS / "northstar-export.json"
        download_info.value.save_as(str(destination))
        exported = json.loads(destination.read_text())
        assert semantic_snapshot(exported) == before
        page.get_by_role("button", name="Edit your profile", exact=True).click()
        page.get_by_role("dialog").get_by_role("button", name="Restore", exact=True).click()
        file_input = page.locator('input[type="file"]')
        file_input.set_input_files({"name": "invalid.json", "mimeType": "application/json", "buffer": b'{"version":99}'})
        expect(page.get_by_role("status")).to_contain_text("valid Northstar JSON backup")
        assert semantic_snapshot(data(page)) == before
        expect(page.get_by_role("dialog", name="Restore your backup?")).to_have_count(0)
        file_input.set_input_files(str(destination))
        confirmation = page.get_by_role("dialog", name="Restore your backup?")
        expect(confirmation).to_be_visible()
        expect(confirmation).to_contain_text("replaces the data")
        assert semantic_snapshot(data(page)) == before
        confirmation.get_by_role("button", name="Cancel", exact=True).click()
        assert semantic_snapshot(data(page)) == before
        # Make a reversible change, then prove restoration reconstitutes every saved domain.
        page.get_by_role("button", name="Add a task", exact=True).click()
        task_dialog = page.get_by_role("dialog", name="One small step.")
        task_dialog.get_by_label("What will you do?").fill("Temporary post-backup task")
        task_dialog.get_by_role("button", name="Add to my plan").click()
        wait_data(page, "data.tasks.some(task => task.title === 'Temporary post-backup task')")
        file_input.set_input_files(str(destination))
        confirmation.get_by_role("button", name="Restore backup", exact=True).click()
        page.wait_for_function("key => !JSON.parse(localStorage.getItem(key)).tasks.some(task => task.title === 'Temporary post-backup task')", arg=DATA_KEY)
        assert semantic_snapshot(data(page)) == before
        page.reload()
        assert semantic_snapshot(data(page)) == before

    def malformed_backups():
        visit(page, url)
        before = semantic_snapshot(data(page))
        file_input = page.locator('input[type="file"]')
        malformed = [
            ("nonobject-profile", {**before, "profile": "bad"}),
            ("invalid-task-date", {**before, "tasks": [*before["tasks"], {"id": "broken-task", "title": "Should never replace data", "date": "2028-02-30"}]}),
            ("invalid-grade-points", {**before, "grades": [*before["grades"], {"id": "broken-grade", "subject": "English", "points": 16, "date": "2026-10-06"}]}),
            ("unverified-task-completion", {**before, "tasks": [{**before["tasks"][0], "completed": True, "completedAt": None}, *before["tasks"][1:]]}),
            ("duplicate-task-record", {**before, "tasks": [*before["tasks"], before["tasks"][0]]}),
        ]
        for name, payload in malformed:
            file_input.set_input_files({"name": name + ".json", "mimeType": "application/json", "buffer": json.dumps(payload).encode()})
            expect(page.get_by_role("status")).to_contain_text("valid Northstar JSON backup")
            expect(page.get_by_role("dialog", name="Restore your backup?")).to_have_count(0)
            assert semantic_snapshot(data(page)) == before, name

    def focus_timestamps():
        visit(page, url, "focus")
        expect(page.locator(".screen-time-card")).to_contain_text("can’t monitor or block")
        expect(page.locator(".timer-footnote")).to_contain_text("not activity in other apps")
        page.get_by_role("button", name="Instagram", exact=True).click()
        page.get_by_role("button", name="Start my break", exact=True).click()
        page.wait_for_function("key => JSON.parse(localStorage.getItem(key))?.app === 'Instagram'", arg=FOCUS_KEY)
        session = page.evaluate("key => JSON.parse(localStorage.getItem(key))", FOCUS_KEY)
        assert isinstance(session["startedAt"], int)
        page.wait_for_timeout(1100)
        page.reload()
        assert page.evaluate("key => JSON.parse(localStorage.getItem(key)).startedAt", FOCUS_KEY) == session["startedAt"]
        assert page.locator(".big-timer").inner_text() != "00:00"
        page.evaluate("key => localStorage.setItem(key, JSON.stringify({startedAt:Date.now()-1799*1000,app:'TikTok'}))", FOCUS_KEY)
        page.reload()
        expect(page.locator(".focus-reminder")).to_contain_text("30 minutes have passed", timeout=5000)
        page.evaluate("key => localStorage.setItem(key, JSON.stringify({startedAt:Date.now()-3599*1000,app:'TikTok'}))", FOCUS_KEY)
        page.reload()
        dialog = page.get_by_role("dialog", name="A moment to reset.", exact=True)
        expect(dialog).to_be_visible(timeout=5000)
        started = time.monotonic()
        submit = dialog.locator('button[type="submit"]')
        expect(submit).to_be_disabled()
        expect(dialog.get_by_role("button", name="Close dialog")).to_have_count(0)
        dialog.get_by_label("What have you done or achieved today?").fill("Finished my chemistry practice after the break.")
        dialog.get_by_label("What do you still need to do now?").fill("Review German vocabulary.")
        page.wait_for_timeout(1500)
        expect(submit).to_be_disabled()
        expect(submit).to_be_enabled(timeout=12000)
        assert time.monotonic() - started >= 8.0, "Ten-second gate enabled too early"
        submit.click()
        expect(dialog).to_be_visible()
        assert dialog.get_by_label("What will help you put your phone down?").evaluate("input => !input.checkValidity()")
        dialog.get_by_label("What will help you put your phone down?").fill("Leave the phone across the room.")
        submit.click()
        expect(dialog).to_have_count(0)
        wait_data(page, "data.reflections.some(entry => entry.achieved === 'Finished my chemistry practice after the break.')")
        ended = page.evaluate("key => JSON.parse(localStorage.getItem(key))", FOCUS_KEY)
        assert ended["stoppedAt"] >= ended["startedAt"]
        expect(page.locator(".timer-status")).to_contain_text("Your break is finished")
        navigate(page, "My progress")
        expect(page.locator(".journal-entry").get_by_text("Finished my chemistry practice after the break.", exact=True)).to_be_visible()

    def offline_and_cache():
        visit(page, url)
        page.evaluate("() => navigator.serviceWorker.ready")
        page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=15000)
        page.evaluate("""async () => {
          const script = document.querySelector('script[type="module"]').src;
          await Promise.all([
            fetch('/api/browser-smoke-private'),
            fetch('/?sensitive=not-a-secret'),
            fetch(script + '?browser-smoke=1'),
            fetch(script, {headers:{Authorization:'Bearer browser-smoke-nonsecret'}})
          ]);
        }""")
        cached = page.evaluate("""async () => {
          const output={};
          for (const name of await caches.keys()) {
            output[name] = (await (await caches.open(name)).keys()).map(request=>request.url);
          }
          return output;
        }""")
        shell_caches = {key: value for key, value in cached.items() if key.startswith("northstar-shell-")}
        assert len(shell_caches) == 1, shell_caches
        urls = next(iter(shell_caches.values()))
        assert f"{url}/" in urls, urls
        assert any("/assets/" in item and item.endswith(".js") for item in urls)
        assert any("/assets/" in item and item.endswith(".css") for item in urls)
        assert any("/assets/" in item and item.endswith(".woff2") for item in urls), "Self-hosted fonts were not precached"
        assert all(item.startswith(url + "/") for item in urls), urls
        assert all("?" not in item and "/api/" not in item for item in urls), urls
        saved = semantic_snapshot(data(page))
        context.set_offline(True)
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_role("heading", name="Your daily plan")).to_be_visible()
        page.evaluate("() => document.fonts.ready")
        for family in ["DM Sans", "Libre Caslon Display"]:
            loaded = page.evaluate("async family => (await document.fonts.load(`16px \"${family}\"`)).map(font => ({family:font.family, status:font.status}))", family)
            assert loaded and all(font["status"] == "loaded" for font in loaded), f"{family} did not load offline: {loaded}"
        assert semantic_snapshot(data(page)) == saved
        navigate(page, "My progress")
        expect(page.get_by_role("heading", name="Your reflection journal")).to_be_visible()
        context.set_offline(False)

    for name, function in [
        ("desktop initial defaults, tabs, overflow and screenshot", initial),
        ("checklist persistence and completion summaries", checklist),
        ("add tasks, date scheduling and category filter", add_tasks),
        ("daily reflection persistence and progress journal", reflection),
        ("profile defaults, edit and reload persistence", profile),
        ("milestone completion and add to today's plan", milestones),
        ("Abitur grade entry range and persistence", grades),
        ("malformed backups cannot silently erase or lose existing records", malformed_backups),
        ("backup download, invalid import, confirmation and full restore", backup_roundtrip),
        ("persisted focus timestamps, 30/60 thresholds and required reflection gate", focus_timestamps),
        ("offline reload and safe service worker caches", offline_and_cache),
        ("desktop has no uncaught JavaScript errors", lambda: expect_errors(errors)),
    ]:
        record_case(results, name, function)
    context.close()


def expect_errors(errors):
    assert errors == [], errors


def mobile_suite(browser, url, results):
    context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, timezone_id="Europe/Berlin")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def mobile():
        visit(page, url)
        expect(page.get_by_role("navigation", name="Mobile navigation")).to_be_visible()
        assert_no_overflow(page)
        page.screenshot(path=str(RESULTS / "northstar-mobile.png"), full_page=True)
        for label in ["Pathway", "Progress", "Focus", "Today"]:
            navigate(page, label, mobile=True)
            assert_no_overflow(page)
        page.get_by_role("button", name="Add a task", exact=True).click()
        dialog = page.get_by_role("dialog", name="One small step.")
        expect(dialog).to_be_visible()
        assert_no_overflow(page)
        dialog.get_by_label("What will you do?").fill("Practice confident speaking on iPhone")
        dialog.get_by_role("button", name="Add to my plan").click()
        row = page.locator(".task-row").filter(has_text="Practice confident speaking on iPhone")
        expect(row).to_be_visible()
        row.locator(".task-check").click()
        page.reload()
        expect(page.get_by_role("button", name="Mark incomplete: Practice confident speaking on iPhone", exact=True)).to_have_attribute("aria-pressed", "true")
        page.get_by_role("button", name="Edit your profile", exact=True).click()
        assert_no_overflow(page)
        dialog = page.get_by_role("dialog", name="A plan that feels like you.")
        expect(dialog.get_by_label("School year / grade")).to_have_value("Grade 12")
        expect(dialog.get_by_label("Intended application year")).to_have_value("")
        page.get_by_role("button", name="Close dialog").click()
        assert errors == [], errors

    record_case(results, "390x844 iPhone layout, all tabs, task persistence and profile", mobile)
    context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:4173")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    RESULTS.mkdir(exist_ok=True)
    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium, headless=True, args=["--no-sandbox"])
        desktop_suite(browser, args.url.rstrip("/"), results)
        mobile_suite(browser, args.url.rstrip("/"), results)
        browser.close()
    (RESULTS / "browser-smoke.json").write_text(json.dumps(results, indent=2) + "\n")
    failed = sum(not result["passed"] for result in results)
    print(f"{len(results) - failed}/{len(results)} browser cases passed. Results: {RESULTS / 'browser-smoke.json'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
