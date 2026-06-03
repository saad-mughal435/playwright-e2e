# playwright-e2e

[![E2E](https://github.com/saad-mughal435/playwright-e2e/actions/workflows/e2e.yml/badge.svg)](https://github.com/saad-mughal435/playwright-e2e/actions/workflows/e2e.yml)
[![Playwright](https://img.shields.io/badge/tested%20with-Playwright-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

Cross-browser **end-to-end test automation** for [saadm.dev](https://saadm.dev),
built with [Playwright](https://playwright.dev) + TypeScript and run in GitHub
Actions on every push, on a nightly schedule, and on demand.

By default the suite targets **live production**, so a green run is also an
uptime + regression check for the real deployments:

- **Site (browser E2E + a11y):** [saadm.dev](https://saadm.dev)
- **API:** the [ShopFloor API](https://github.com/saad-mughal435/shopfloor-api),
  a Spring Boot 3 backend on a free Render instance

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
| `a11y.spec.ts` | No critical/serious axe-core (WCAG 2.0/2.1 A & AA) violations on the homepage + contact page |
| `api/shopfloor.spec.ts` | Live ShopFloor API — health, OpenAPI, JWT auth (valid → token, invalid → 401, unauth → 401), and read-only domain reads (lines, rolling OEE, job orders, inventory, QC holds) |

The API tests are **read-only** (login + `GET` only) and never mutate the demo
data; the free instance can cold-start (~50s), which a warm-up hook absorbs.

## Projects (browsers / devices)

- **Browser E2E** runs across five projects — **Desktop** Chromium / Firefox /
  WebKit and **emulated mobile** Pixel 7 / iPhone 14.
- **Accessibility** runs once on desktop Chromium (axe results are
  engine-independent).
- **API** runs in its own browserless `api` project against the ShopFloor API.

## Running locally

```bash
npm ci
npx playwright install        # download browser binaries

npm test                      # everything (browsers + API)
npm run test:site             # browser E2E + a11y, all browsers
npm run test:api              # ShopFloor API tests only
npm run test:chromium         # fastest: Chromium only
npm run test:ui               # interactive UI mode
npm run report                # open the last HTML report
```

### Targeting a different environment

Both targets are configurable, so the same suite can run against local copies:

```bash
# site: in the site repo, run `python -m http.server 8000`
BASE_URL=http://127.0.0.1:8000 npm run test:site

# API: point at a locally running ShopFloor API
API_BASE_URL=http://localhost:8080 npm run test:api
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

Playwright Test (browser + API) · axe-core · TypeScript · Node 18+ · GitHub Actions
