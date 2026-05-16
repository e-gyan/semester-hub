# Semester Hub

A self-contained graduate-school dashboard for tracking courses, assignments, weekly planning, professional development, personal life, and analytics — all in one place.

Built as a single-page web app with no build step. Open `index.html` in any modern browser and it just works.

## Features

- **Dashboard** — week tracker, four live stats, upcoming deadlines, today's focus, semester heatmap, quick capture
- **Courses** — per-course cards with assignments (title, description, type, due, weight, score, grade calc), readings (with type tag and rich-text notes), dated journal-style notes with rich text, automatic GPA/letter-grade computation
- **Weekly Planner** — 13-week grid view, tasks per week, week reflections, integrates with assignment due dates
- **Professional** — applications pipeline, networking contacts, skill progress, portfolio projects
- **Personal** — habit tracker (7-day grid), monthly budget, goals, wellness check-in with mood trend
- **Analytics** — time allocation doughnut, deadline heatmap, GPA projector, weekly time trend, completion bars
- **Cloud sync** — optional PIN-protected sync to [JSONBin.io](https://jsonbin.io). Credentials encrypted at rest with AES-256-GCM, key derived from PIN via PBKDF2-SHA256 (150k iterations). Lock screen on new sessions.
- **Mobile-friendly** — responsive layout at 1000px / 760px / 480px breakpoints, touch-friendly tap targets

## Quick start

1. Clone or download this repository.
2. Open `index.html` in Chrome, Edge, Firefox, or Safari — any modern browser.
3. Set your semester name, start date, and total weeks in Settings.
4. Add courses, assignments, readings — nothing is pre-populated.

## Project structure

```
semester-hub/
├── index.html              ← Entry point. Loads CSS + scripts.
├── README.md
├── .gitignore
├── styles/
│   ├── base.css            ← Design tokens, theme, reset, scrollbar
│   ├── layout.css          ← App grid, sidebar, topbar, responsive
│   └── components.css      ← Buttons, panels, cards, tables, modals,
│                             overlays, rich text editor, heatmap
└── scripts/
    ├── helpers.js          ← DOM helpers, toast, date / week math,
    │                         inline editors, rich-text editor
    ├── state.js            ← Global state, persistence, GPA & grade math
    ├── security.js         ← Web Crypto, JSONBin cloud sync, lock /
    │                         setup overlays, PIN-gated operations
    ├── modals.js           ← Modal infrastructure + all build*Modal
    ├── views.js            ← All render* functions for every view
    └── app.js              ← Event wiring + init() (loaded last)
```

Script load order matters — each file may reference globals defined earlier. The order in `index.html` is enforced: `helpers → state → security → modals → views → app`.

## Cloud sync setup

1. Sign up for a free [JSONBin.io](https://jsonbin.io/login) account and copy your Master Key.
2. In Semester Hub: **Settings → Cloud sync → Set up cloud sync**.
3. Choose a PIN (4+ characters), paste your Master Key, leave Bin ID empty to auto-create a new private bin.
4. Click **Set up & connect**.

On any other device, repeat steps 2–3 using the same Master Key plus the Bin ID (visible in the sync info card after first connect — click it to copy). Choose to use the cloud copy, and your data flows in.

### Security model

- Master Key encrypted with **AES-256-GCM** before storage
- Encryption key derived from PIN via **PBKDF2-SHA256, 150,000 iterations**, separate 128-bit salt
- PIN itself hashed with PBKDF2 (separate salt) for verification — never stored in plaintext
- 5 wrong PIN attempts → 60-second lockout
- Sensitive operations (change credentials, change PIN, disconnect) re-prompt for PIN
- All crypto runs in the browser via the Web Crypto API — no third-party code, no telemetry

**What this protects:** Someone reading localStorage on this device (DevTools, file dump, browser sync) cannot recover your Master Key.

**What it can't protect against:** A live attacker with control of an unlocked browser. That's a limit of any client-side app.

## Deployment

Since this is just HTML/CSS/JS, you can host it on any free static host. See `index.html` for the canonical entry point.

Recommended options:

- **Netlify Drop** ([app.netlify.com/drop](https://app.netlify.com/drop)) — drag the folder onto the page.
- **GitHub Pages** — push this repo to GitHub, then *Settings → Pages → Deploy from branch (main, root)*.
- **Cloudflare Pages** — *Workers & Pages → Pages → Upload assets*.

On Android Chrome, after deploying, open the URL and use the three-dot menu → **Add to Home screen** for an app-like icon.

## Browser support

Requires a modern browser with support for:

- ES2020+ JavaScript (`optional chaining`, `nullish coalescing`, `structuredClone`)
- Web Crypto API (`crypto.subtle`) — for cloud sync feature
- Local Storage — for state persistence
- CSS Grid & custom properties

Tested in Chrome 120+, Firefox 120+, Safari 16+, Edge 120+.

## Privacy

All data stays in your browser by default. Cloud sync is opt-in. Your JSONBin Master Key is encrypted on disk before storage. No analytics, no tracking, no third-party requests besides:

- `cdn.jsdelivr.net` — Chart.js library
- `api.jsonbin.io` — only if you enable cloud sync

## License

Personal project. Use freely.
