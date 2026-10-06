# Using Northstar on an iPhone

Northstar is a mobile web app. Open its deployed **HTTPS address** in Safari,
tap the Share button, and choose **Add to Home Screen**. If your iPhone offers
an **Open as Web App** setting, leave it enabled. Launch Northstar from its new
Home Screen icon for the standalone app experience.

The production site must serve the app at its domain root (`/`) for the
included manifest and service worker. A local development server is useful
for development, but an iPhone needs a reachable HTTPS deployment to install
the app and enable its offline worker. The worker is intended for production
builds, not Vite's development server.

## Your plans and backups

Plans, preferences, grades, and reflections are stored locally in this
browser's storage. They are not sent to a server or synchronized across
devices. Treat the Safari version and installed app as potentially separate
storage contexts; use the context you intend to keep using. Browser storage
can be removed by clearing website data, private browsing, storage eviction,
or device changes.

Use the app's data export to keep a backup before clearing website data,
switching devices, or making major changes. Keep backups somewhere you
control, such as Files or iCloud Drive. An export contains your personal
planning information, so share it deliberately.

## Offline access and updates

On the first successful visit to a production deployment, the service worker
downloads the app shell, icons, and the built JavaScript and CSS. Once that
installation finishes, the app can open offline and your local plans remain
available. Wait for the first page to finish loading while online before
depending on offline access.

Navigation tries the network first and falls back to the saved app shell
when offline. Only the app's public, same-origin static files are cached;
external requests and API, authentication, and data paths are excluded. A
deployment with changed worker content downloads the new version in the
background. Close all open Northstar tabs and the installed app, then reopen
while online to let a waiting worker activate. Each worker version removes
only older caches with Northstar's own prefix. Clearing the app cache is
separate from the app's locally stored planning data.

## TikTok, Instagram, and Snapchat limits

A web app cannot read your time in other iPhone apps, monitor their usage in
the background, or block them. A Northstar focus timer or reflection prompt
works only within Northstar. It cannot automatically interrupt TikTok after
30 minutes or enforce a countdown in Snapchat after an hour.

For limits on those apps, use Apple's built-in **Settings → Screen Time →
App Limits → Add Limit**, select the apps, and choose a daily limit. If your
Screen Time configuration offers **Block at End of Limit**, enable it for a
stronger boundary. Screen Time limits can still be extended depending on
your settings; a trusted person's Screen Time passcode is an optional way to
make extensions harder.

The requested cross-app monitoring and blocking requires a separate native
iOS implementation using Apple's Screen Time frameworks, authorization,
extensions, and the relevant Apple entitlement. It is not a feature this
web version can provide.
