# Open Northstar on your iPhone

The browser prototype needs a real HTTPS address. The native iPhone app
still requires Apple signing and device validation. Publishing the planning
website does not enable native Screen Time restrictions.

## GitHub Pages

This repository contains a Pages workflow in
`.github/workflows/pages.yml`. It uses frozen dependencies, runs the
planning tests, builds for the path returned by GitHub Pages, and deploys
only the static `dist` output. Planning data remains in your browser; it
is not uploaded to GitHub when you use the app.

Once the source is on the repository's `main` branch:

1. In GitHub, open the repository's **Settings → Pages**.
2. Set **Build and deployment → Source → GitHub Actions**. The repository
   owner needs the appropriate settings permission. Availability depends
   on repository visibility and the GitHub plan; keep the current visibility
   unless the owner explicitly chooses to change it.
3. Open **Actions → Publish Northstar planning prototype → Run workflow**.
   Future changes to the browser app on `main` publish through the same
   workflow.
4. Wait for the deploy job to succeed and use the URL reported by GitHub.
5. Open that verified URL in iPhone Safari. Choose **Share → Add to Home
   Screen**. Keep the site name Northstar and tap **Add**.

The app works at the domain root or a repository path such as `/chat/`.
Its manifest, icons, font assets, service worker, and offline cache use the
matching path. Different Northstar installations on the same host have
separate offline caches; browser planning data is currently shared by
origin, so use backups before moving between hosted installations.

## Other static HTTPS hosts

The root build from `npm run build` produces `dist/`. Upload its contents as
the site's root folder on a static HTTPS host only if intentionally choosing
another host. All fonts are bundled locally. No backend server,
hosting token, database, or Apple account is required to run the planning
prototype.

For a custom directory, set `NORTHSTAR_BASE_PATH` to its slash-delimited
path while building, for example:

```sh
NORTHSTAR_BASE_PATH=/chat/ npm run build
```

Deployment credentials, if your chosen host requires them, belong in that
host's secure settings. Never put them into the app or send their values
in chat.

## Existing website

The existing Pages site is
[https://96gb7p6wfp-a11y.github.io/chat/](https://96gb7p6wfp-a11y.github.io/chat/).
Pages already uses **GitHub Actions**. Preserve this configuration, the repository,
visibility and URL. A reviewed push to the existing `main` branch triggers the
existing workflow; verify that run and the public release assets before claiming
a new publication succeeded.

The first failed October 6 run predates Pages activation and is not the status of
the current site. No setup change is needed to retry a new release.

All personal records stay in browser local storage on this same origin. Published
school-document drafts require local review; deployment never replaces existing
saved grades, timetable corrections or progress.
