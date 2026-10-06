# Northstar

A daily compass for stronger grades, English/German practice, confidence,
and a clearer college pathway. The starting profile reflects Grade 12 at a
public German Gymnasium and **Abitur completion in summer 2028**. Application
and university entry dates remain undecided. No grades or achievements are
invented.

The **browser planning prototype** is built and tested. The **native iPhone
project** includes Apple Screen Time integration source, but it has not been
compiled, signed, or tested on an iPhone in this Linux workspace.

## Try the planning workflow

The prototype includes:

- Six balanced, varied daily steps, with an editable time budget.
- Custom tasks, date selection, completion history, and college milestones.
- English/German practice and manageable confidence exercises.
- German upper-secondary grade records using 0–15 points.
- Today, monthly, and overall progress, with a reflection journal.
- JSON backups and offline access after the first production visit.
- A voluntary social-break timer and ten-second reflection preview.

Your data stays in the current browser or native app. There is no login,
cloud sync, analytics, or automatic admissions prediction. Keep backups;
deleting the app or clearing browser storage can remove your records.

To test on an iPhone, the browser prototype needs **HTTPS hosting**. The
source is on GitHub `main`, and the Pages publishing workflow is ready.
The first run stopped because Pages is not enabled. The available GitHub
integration can push source but cannot activate Pages (HTTP 403). The
repository owner must select **Settings → Pages → Source → GitHub Actions**;
then rerun the publishing workflow. A public website has not been verified
yet. [iPhone instructions](docs/iphone.md) explain installation and data
storage. A local development server address is not an iPhone installation
link.

[Hosting instructions](docs/hosting.md) and a GitHub Pages workflow are
included. Root hosting and repository paths such as `/chat/` are supported.
GitHub API access now works. Initial Pages activation requires the owner's
settings change; no new credentials need to be shared.

## Develop the browser prototype

Use Node.js 24 (validated here with 24.19.0). From this repository root:

```sh
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
npm test
npm run build
npm run dev -- --port 5173 --strictPort
```

For production smoke checks, start the preview in one terminal and run the
browser suite in another:

```sh
npm run preview -- --port 4173 --strictPort
python3 tests/browser_smoke.py --url http://127.0.0.1:4173
```

To build and check both root hosting and the `/chat/` path without changing
the main `dist` directory:

```sh
python3 tests/hosting_smoke.py
```

The smoke suite requires Python Playwright and Chromium. Both are available
in this cloud workspace. It exercises the actual UI, persistence, grade
records, backups, reflection gate, mobile layout, and offline fonts/assets.
It does not validate Mobile Safari or native Screen Time behavior.

## Native iPhone app

[Native build instructions](native/README.md) cover XcodeGen, signing,
simulator tests, and physical-device checks. The SwiftUI app includes the
planner, grade tracking, journal, profile, backups, and three Screen Time
extensions. Each selected app has its own 30-minute reminder and 60-minute
shield. The host app contains a persisted ten-second pause and three
questions before a deliberate ten-minute access break.

The system shield instructs you to open Northstar yourself. Apple does not
allow an arbitrary countdown and questionnaire to be drawn over another
app. iOS usage callbacks can arrive late, so exact interruption timing must
be checked on a physical device.

A Mac or a macOS build service, suitable Apple developer signing, and the
Family Controls capability are needed for an installable native build.
TestFlight/App Store distribution also needs Apple's entitlement approval.
The included GitHub Actions workflow prepares unsigned simulator builds and
XCTest when the source is pushed to GitHub. Its first run failed during
`xcodebuild`; a diagnostic rerun is being prepared. No native build or test
pass is claimed. Unsigned artifacts cannot be installed on an iPhone.

Without a native build, use Apple's **Settings → Screen Time → App Limits**
for real restrictions and this prototype for planning. The browser cannot
observe or block TikTok, Instagram, or Snapchat.

## Validation status

- Browser production build and 15 JavaScript tests passed.
- 13 Chromium browser cases passed, including a 390 × 844 mobile layout.
- 5 root/subpath hosting checks passed, including offline fonts and isolated
  service-worker caches. The first Pages workflow run stopped at the missing
  repository Pages setting, before build or deployment.
- Native project metadata, plists, entitlements, and icon passed validation.
- 11 native XCTest cases are written; Xcode execution and physical-device
  Screen Time validation remain outstanding.

Official university links are included in the pathway. Current admissions
requirements, deadlines, fees, and financial aid must be checked for your
applicant type and intended entry year.
