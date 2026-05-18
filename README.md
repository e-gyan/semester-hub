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
├── bake-credentials.html   ← Standalone tool: encrypt JSONBin creds with PIN
├── README.md
├── .gitignore
├── styles/
│   ├── base.css            ← Design tokens, theme, reset, scrollbar
│   ├── layout.css          ← App grid, sidebar, topbar, drawer, responsive
│   └── components.css      ← Buttons, panels, cards, tables, modals,
│                             overlays, rich text editor, heatmap
└── scripts/
    ├── embedded-credentials.js  ← (Optional) Encrypted JSONBin creds
    │                              created by bake-credentials.html
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

Two modes are supported. Pick one.

### Mode A — Embedded credentials (PIN-only login on every device)

Bake your JSONBin credentials into the source code, encrypted with your PIN. Every device that opens the deployed site shows the lock screen — enter the PIN once and it syncs.

1. Open `bake-credentials.html` in a browser (locally or via your deployed URL).
2. Type a PIN (10+ chars with mixed letters / numbers / symbols recommended for public repos), your JSONBin Master Key, and Bin ID.
3. Click **Generate embedded-credentials.js**, then **Download as file** (or copy the snippet).
4. Save it to `scripts/embedded-credentials.js` in your project.
5. Commit and push. The deployed site now uses embedded mode — lock screen on every load, PIN unlocks the sync.

To **change** the PIN or credentials later, re-run `bake-credentials.html` with the new values and replace `scripts/embedded-credentials.js`.

For the **monolithic** `semester-hub.html`, paste the generated `window.EMBEDDED_CREDS = { ... };` line into the file at the marked spot near the top of the `<script>` block.

### Mode B — Per-device setup

Each device runs through a setup wizard at first launch.

1. Sign up for a free [JSONBin.io](https://jsonbin.io/login) account and copy your Master Key.
2. In Semester Hub: **Settings → Cloud sync → Set up cloud sync**.
3. Choose a PIN, paste your Master Key, leave Bin ID empty to auto-create a new private bin.
4. Click **Set up & connect**.
5. On any other device, repeat — use the same Master Key plus the Bin ID (visible in the sync info card after first connect).

### Security model

- Master Key encrypted with **AES-256-GCM** before storage / before being baked into the repo
- Encryption key derived from PIN via **PBKDF2-SHA256** with a separate 128-bit salt
  - Per-device mode: 150,000 iterations
  - Embedded mode: 250,000 iterations by default (adjustable up to 2,000,000 in the bake tool)
- PIN itself hashed with PBKDF2 (separate salt) for verification — never stored in plaintext
- 5 wrong PIN attempts → 60-second lockout
- All crypto runs in the browser via the Web Crypto API — no third-party code, no telemetry

**What this protects:** anyone with your source code, deployed site, or a localStorage dump sees only ciphertext. Without your PIN they cannot recover the Master Key.

**What it can't protect against:** a live attacker with control of an unlocked browser, or a brute-force attempt against a weak PIN. For **public repos** in particular, choose a strong PIN — 10+ characters with mixed letter/number/symbols — because anyone can download the encrypted blob and try guesses offline. At 250k PBKDF2 iterations each guess takes ~hundreds of milliseconds, so a long passphrase makes brute force impractical.

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
