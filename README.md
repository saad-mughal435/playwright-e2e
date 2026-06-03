# playwright-e2e

[![E2E](https://github.com/saad-mughal435/playwright-e2e/actions/workflows/e2e.yml/badge.svg)](https://github.com/saad-mughal435/playwright-e2e/actions/workflows/e2e.yml)
[![Playwright](https://img.shields.io/badge/tested%20with-Playwright-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

Cross-browser **end-to-end test automation** for [saadm.dev](https://saadm.dev),
built with [Playwright](https://playwright.dev) + TypeScript and run in GitHub
Actions on every push, on a nightly schedule, and on demand.

By default the suite targets the **live production site**, so a green run is
also a uptime + regression check for the real deployment.

## What it covers

| Spec | What it verifies |
| --- | --- |
| `smoke.spec.ts` | Core pages (`/`, `/demo.html`, `/contact.html`) return 2xx with a title and visible body |
| `home.spec.ts` | The React SPA mounts, shows Saad's identity, and links out to GitHub |
| `seo.spec.ts` | Canonical URL, meta description, Open Graph / Twitter cards, and valid `Person` JSON-LD |
| `navigation.spec.ts` | Click-through from the homepage to the contact page |
| `contact.spec.ts` | Contact form fields, required/typed validation contract, and honeypot — **without submitting** |
| `projects.spec.ts` | All 11 interactive project demos load and render real content |
| `pwa.spec.ts` | The Lahza PWA ships a valid web app manifest and a reachable service worker |

## Browsers / devices

Every spec runs across five projects:

- **Desktop** — Chromium, Firefox, WebKit
- **Mobile (emulated)** — Pixel 7, iPhone 14

## Running locally

```bash
npm ci
npx playwright install        # download browser binaries

npm test                      # all specs, all browsers
npm run test:chromium         # fastest: Chromium only
npm run test:ui               # interactive UI mode
npm run report                # open the last HTML report
```

### Targeting a different environment

The base URL is configurable, so the same suite can run against a local copy of
the site:

```bash
# in the site repo: python -m http.server 8000
BASE_URL=http://127.0.0.1:8000 npx playwright test
```

## CI

[`.github/workflows/e2e.yml`](.github/workflows/e2e.yml) installs dependencies
and all browsers, runs the full matrix, and uploads the HTML report as a build
artifact (kept 14 days). It triggers on:

- every push / pull request to `main`
- a daily cron (`06:00 UTC`)
- manual `workflow_dispatch`

## Design notes

- **No side effects.** The contact form posts to a third-party backend, so its
  tests assert structure and validation only and never submit — CI never sends a
  real message.
- **Resilient selectors.** The homepage is client-rendered (React via CDN); the
  specs wait on the mounted DOM rather than racing the hydration.
- **Data-driven.** Pages and project demos live in `tests/fixtures/routes.ts`;
  adding a route there extends coverage automatically.

## Tech

Playwright Test · TypeScript · Node 18+ · GitHub Actions
