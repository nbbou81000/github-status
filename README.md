# GitHub Status — TRMNL plugin

**The live health of 11 GitHub services on your TRMNL e-ink display, with incident history and a detailed incident view. English / French.**

[![Install on TRMNL](https://img.shields.io/badge/TRMNL-Install%20recipe-black?style=flat-square)](https://trmnl.com/recipes/447346)
![Languages](https://img.shields.io/badge/languages-EN%20%7C%20FR-blue?style=flat-square)
![No API key](https://img.shields.io/badge/API%20key-none-brightgreen?style=flat-square)
![Updates](https://img.shields.io/badge/updates-every%2015%20min-orange?style=flat-square)

![GitHub Status on a TRMNL display](https://trmnl-public.s3.us-east-2.amazonaws.com/os8ua17vdd7dd1lx9pfz0mkp9vwq)

---

## What it does

Know at a glance whether `git push`, Actions or Copilot are down — before you lose ten minutes wondering if it's your fault.

### 🟩 Overview
Each service gets its current status and a row of squares, one per day, showing its incident history over the last 7 or 30 days.

### 🚨 Incident details
Lists ongoing incidents with their progress (Investigating → Identified → Monitoring → Resolved) and the latest updates from GitHub.

### Services covered

Git Operations · Webhooks · API Requests · Issues · Pull Requests · Actions · Packages · Pages · Copilot · Codespaces · Copilot AI Model Providers

### Status scale

| Square | Meaning |
|---|---|
| OK | Operational |
| Degraded | Degraded performance, minor incident or maintenance |
| Partial | Partial outage, major incident |
| Major | Major outage, critical incident |

## Settings

| Setting | Options |
|---|---|
| **Display mode** | Overview with sparklines / Incident details |
| **History** | 7 days / 30 days |
| **Language** | English / Français |

## Installation

1. Open the recipe page: **[trmnl.com/recipes/447346](https://trmnl.com/recipes/447346)**
2. Click **Install**, choose your settings, and add it to a playlist.

No GitHub account or API key needed.

---

## How it works

```
githubstatus.com public API ──► GitHub Actions (every 15 min) ──► docs/data/status.json ──► GitHub Pages ──► TRMNL
```

`scripts/fetch-github-status.mjs` calls GitHub's official, public [Statuspage API](https://www.githubstatus.com/api) — no authentication:

| Endpoint | Used for |
|---|---|
| `/api/v2/components.json` | Current status of each service |
| `/api/v2/incidents.json` | Day-by-day history, rebuilt from past incidents and the services they affected |
| `/api/v2/incidents/unresolved.json` | Incident details view |
| `/api/v2/status.json` | Overall indicator ("All Systems Operational") |

It writes a **ready-to-display** JSON: statuses are already mapped to CSS classes and labels, and the history is already sliced to 7, 30 and 90 days, so the Liquid template only has to loop.

### Data endpoint

`https://nbbou81000.github.io/github-status/data/status.json`

```json
{
  "generated_at": "2026-10-08T08:01:20Z",
  "overall": { "indicator": "none", "description": "All Systems Operational" },
  "components": [
    {
      "name": "Git Operations",
      "short_name": "Git Ops",
      "status_class": "op",
      "status_label": "OK",
      "history_7":  [ { "date": "2026-10-02", "class": "op" }, … ],
      "history_30": [ … ],
      "history_90": [ … ]
    }
  ],
  "incidents": [
    {
      "name": "…",
      "impact": "minor",
      "started_label": "2026-10-07 · depuis 14:02 UTC",
      "steps":   [ { "label": "Investigating", "state": "done" }, … ],
      "updates": [ { "status_label": "Monitoring", "body": "…", "time_label": "15:10 UTC" } ]
    }
  ],
  "has_active_incident": false
}
```

---

## Repository layout

| Path | Role |
|---|---|
| `scripts/fetch-github-status.mjs` | Fetches the Statuspage API and builds `status.json` |
| `docs/data/status.json` | The JSON polled by TRMNL |
| `docs/.nojekyll` | Lets GitHub Pages serve the folder as-is |
| `.github/workflows/update-status.yml` | Runs the script every 15 minutes (and on demand) |

## Run your own

1. Fork the repo.
2. **Settings › Pages**: deploy from the `main` branch, `/docs` folder.
3. **Actions** tab: enable workflows, then **Run workflow** once.
4. In TRMNL, point the Polling URL to `https://YOUR-USERNAME.github.io/github-status/data/status.json`.

GitHub's scheduled workflows can drift by several minutes under load. For tighter timing, trigger `workflow_dispatch` from an external scheduler such as cron-job.org.

To track other services, edit the `COMPONENT_SHORT_NAMES` list at the top of the script.

## Credits

- Data from the public [GitHub Status](https://www.githubstatus.com/) API. This plugin is not affiliated with or endorsed by GitHub.
- Built for [TRMNL](https://trmnl.com).

## Author

Made by **Nicolas Bouteiller** — [@nbbou81000](https://github.com/nbbou81000) · nb.bouteiller@gmail.com

If you enjoy it, you can [buy me a coffee on Ko-fi](https://ko-fi.com/nicolasbouteiller) ☕

## License

MIT License — see [`LICENSE`](LICENSE).
