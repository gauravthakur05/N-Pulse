# Pulse : Internet Speed & Network Health Monitor

A premium, single-file web app that measures your real internet speed and tells you how healthy and stable your connection is. No sign-up, no backend, no fake numbers.

**Files:** `index.html` · `styles.css` · `script.js`

---

## Getting Started

No installation, no build step, no server required.

1. Unzip the download — keep `index.html`, `styles.css`, and `script.js` together in the same folder (the HTML file references the other two by relative path).
2. Double-click `index.html` to open it in any modern browser (Chrome, Edge, Firefox, Safari).
3. Click **Start Speed Test**.

That's it. If you'd rather host it, drop all three files into any static web host or file server — no backend or build step needed.

### File structure

```
pulse-speed-test/
├── index.html   → markup and page structure
├── styles.css   → all visual design (theme, layout, responsive rules)
├── script.js    → speed-test engine, health scoring, charts, history
└── README.md    → this file
```

> **Note:** open it as a local file or host it yourself on any static web server. It will not work correctly if embedded inside a sandboxed preview/iframe that blocks outbound network requests, since real speed measurement needs to reach external test servers.

---

## What It Measures (and how)

Every number on screen comes from a real network request — nothing is randomly generated.

| Metric | How it's measured |
|---|---|
| **Download speed** | Parallel XHR downloads of increasing size from Cloudflare's public speed-test edge (`speed.cloudflare.com/__down`), sampled every 200ms |
| **Upload speed** | Parallel XHR uploads of randomly generated data to `speed.cloudflare.com/__up` |
| **Ping / Latency** | Median round-trip time across 8 timed requests to the same edge |
| **Jitter** | Average variation between consecutive ping samples |
| **Packet loss** | Percentage of the 8 ping requests that failed or timed out |
| **Stability** | Derived from the variance of download speed samples during the test |
| **Public IP / ISP / location** | External lookups via ipify.org and ipapi.co |
| **Browser / OS / connection type** | Read directly from the browser (`navigator.userAgent`, `navigator.connection`) |

The **Network Details** tab clearly tags each value as either "Detected" (read directly from your browser) or "External API" (fetched from a third-party lookup service), so you always know the source.

### Internet Health Score (0–100)

A weighted composite, not just a download number:

- Download 30% · Ping 20% · Packet loss 15% · Upload 15% · Stability 10% · Jitter 10%

Score bands: 90+ Excellent · 75+ Very Good · 60+ Good · 40+ Fair · below 40 Poor. Each band comes with a plain-language explanation and, when something is weak, specific troubleshooting suggestions.

---

## Features

- Live animated speedometer with real-time graph during testing
- Step-by-step test flow: Checking Connection → Latency → Download → Upload → Analyzing → Health Score
- Full connection analysis with a "what can you do with this connection" checklist (streaming, gaming, video calls, cloud apps, large downloads)
- Local history (stored in your browser's Local Storage only — nothing leaves your device except the test traffic itself) with trend charts and summary stats
- Shareable result card (PNG download, copy to clipboard, native share sheet where supported)
- Dark/light theme toggle
- Fully responsive, keyboard-accessible, no login walls or popups
- Friendly error handling with a Try Again button if the test or network fails

---

## Data & Privacy

- No account, no login, no server-side storage.
- Test history lives only in your browser's Local Storage — clearing it (via the **Clear History** button, or your browser settings) permanently deletes it.
- Speed measurement traffic goes to Cloudflare's public test endpoints; IP/ISP lookups go to ipify.org and ipapi.co. No other data is sent anywhere.

---

## Known Limitations

- Speed test accuracy depends on your device, browser, Wi-Fi conditions, and the load on the shared test endpoints — like any browser-based speed test, it's a strong estimate, not a lab-grade measurement.
- IPv6 and ISP/organization lookups depend on free third-party APIs and may occasionally be rate-limited or unavailable; the app degrades gracefully and shows "Not available" rather than guessing.
- `navigator.connection` (reported connection type/downlink) is only exposed by some Chromium-based browsers.

---

## Tech Stack

Vanilla HTML, CSS, and JavaScript (no framework, no build step) plus Chart.js for the trend charts, loaded from a CDN. This keeps the whole app in one portable file you can open anywhere or drop onto any static host — no Node/React build pipeline required.

---

© 2026 Gaurav Thakur
