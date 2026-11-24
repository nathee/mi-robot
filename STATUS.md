# Mi Robot Simulator — REA Clone

**Source:** https://doc.inex.co.th/mirobot/index.html
**Captured:** 2026-11-23 (Asia/Bangkok)
**Status:** ✅ COMPLETE — verified byte-identical mirror, real-browser verified

## What the app is

"Mi Robot Simulator" (Mirobot Simulator v0.0.1) — a **6-DOF robot arm simulator**
(credits: WLKATA Robotics • inex).
Vue 3 + Element Plus + three.js (WebGL) single-page app. Features: FK/IK
(analytic / constrained / DLS solvers), joint & linear jog, workspace & path
planning, frames/labels, theme toggle, timeline console.

**Fully static** — no backend, no API, no WebSocket, no workers. Only
localStorage key: `themeMode`.

## Clone layout

```
/home/ubuntu/mirobot-clone/
├── clone/                  ← the deliverable (serve this dir)
│   ├── index.html          (1,429 B)
│   └── assets/
│       ├── index-Keh5JANj.js   (3,786,386 B — app + three.js + Element Plus)
│       ├── index-oZgPyLZC.css  (404,589 B)
│       └── base/link1..6-*.stl (7 × 3D models, 6.99 MB total)
├── evidence/
│   ├── captures/           (index.html, live-shot.png, clone-shot.png)
│   ├── assets/             (same 10 files, capture copies)
│   └── provenance/manifest.txt  (SHA-256 per file, mirror vs live re-fetch)
└── STATUS.md
```

## Verification (all PASS)

| Check | Result |
|---|---|
| SHA-256 mirror vs live re-fetch, all 10 files | 10/10 identical |
| REA `analyze_javascript_application` | 0 parse failures, 0 request relations, 0 worker/child-process relations |
| Real browser, clone | 10 resources, only favicon.ico 404 (live server 404s it too — parity) |
| Real browser, live | 10 resources, 0 failures |
| Canvas pixel hash (clone vs live) | identical: `4ce9a10:len6730` |
| DOM text hash, digits stripped (clone vs live) | identical: `83f31d12:1130` |
| DOM counts (buttons/inputs/canvas) | 32 / 62 / 1 — identical |

Note: 7 `.stl` model files are referenced via Vite `new URL("…", import.meta.url)`
glob imports — they are NOT referenced in the HTML, so a naive HTML-only mirror
404s them. Caught by real-browser resource inspection.

## Running

```bash
cd /home/ubuntu/mirobot-clone/clone
python3 -m http.server 8090 --bind 0.0.0.0
```

Currently running as background process `proc_cb040ca02fb0` (PID 38150).
Local: http://127.0.0.1:8090/ — LAN: http://<host-ip>:8090/

## Known parity notes

- No favicon on the live site (404) — clone matches.
- Footer clock + console timestamps are live time — differ by seconds, by design.
- Headless WebGL renders the arm faintly (SwiftShader); identical on both.
