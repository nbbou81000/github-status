// fetch-github-status.mjs
// Récupère le statut GitHub (githubstatus.com, propulsé par Statuspage.io) et produit
// un JSON "prêt à afficher" pour les templates Liquid TRMNL (écran A + écran B).
//
// Architecture (comme tes autres plugins) :
//   ce script (Node) --> GitHub Actions (déclenché par cron-job.org) --> JSON statique sur GitHub Pages
//   --> le template Liquid TRMNL poll ce JSON.
//
// Aucune clé API requise : l'API Statuspage de GitHub est publique et gratuite.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://www.githubstatus.com/api/v2";
const OUTPUT_PATH = "docs/data/status.json"; // adapte si ton GitHub Pages sert un autre dossier
const HISTORY_DAYS = 90; // on calcule toujours 90 jours ; le template choisit combien afficher (7/30/90)

// Composants qu'on veut vraiment afficher (on ignore les entrées "groupe" de l'API).
// short_name = libellé compact utilisé dans les templates.
const COMPONENT_SHORT_NAMES = {
  "Git Operations": "Git Ops",
  "Webhooks": "Webhooks",
  "API Requests": "API Req.",
  "Issues": "Issues",
  "Pull Requests": "Pull Req.",
  "Actions": "Actions",
  "Packages": "Packages",
  "Pages": "Pages",
  "Copilot": "Copilot",
  "Codespaces": "Codespaces",
  "Copilot AI Model Providers": "Copilot Models",
};

// Mapping statut Statuspage -> notre échelle à 4 niveaux (utilisée pour les carrés + libellés).
const STATUS_MAP = {
  operational: { class: "op", label: "OK", severity: 0 },
  degraded_performance: { class: "deg", label: "Dégradé", severity: 1 },
  partial_outage: { class: "part", label: "Partiel", severity: 2 },
  major_outage: { class: "maj", label: "Majeur", severity: 3 },
  under_maintenance: { class: "deg", label: "Maintenance", severity: 1 },
};

// Mapping impact d'incident -> même échelle (pour construire l'historique jour par jour).
const IMPACT_MAP = {
  none: { class: "op", severity: 0 },
  maintenance: { class: "deg", severity: 1 },
  minor: { class: "deg", severity: 1 },
  major: { class: "part", severity: 2 },
  critical: { class: "maj", severity: 3 },
};

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "trmnl-github-status-plugin (github.com/nbbou81000)" },
  });
  if (!res.ok) {
    throw new Error(`Échec fetch ${url} : ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function dayKey(dateIso) {
  return dateIso.slice(0, 10); // "YYYY-MM-DD"
}

function buildEmptyHistory(days) {
  const today = new Date();
  const map = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    map.set(dayKey(d.toISOString()), 0); // 0 = opérationnel par défaut
  }
  return map;
}

async function main() {
  // 1) Statut courant de chaque composant
  const componentsRes = await fetchJson(`${API_BASE}/components.json`);
  const rawComponents = (componentsRes.components || []).filter(
    (c) => !c.group && COMPONENT_SHORT_NAMES[c.name]
  );

  // 2) Incidents (récents, résolus inclus) pour construire l'historique par composant
  //    + incidents non résolus pour l'écran B (détail).
  const incidentsRes = await fetchJson(`${API_BASE}/incidents.json`);
  const allIncidents = incidentsRes.incidents || [];

  const unresolvedRes = await fetchJson(`${API_BASE}/incidents/unresolved.json`);
  const unresolvedIncidents = unresolvedRes.incidents || [];

  // 3) Historique jour par jour, par composant (sévérité max ce jour-là)
  const historyByComponent = new Map(); // component_id -> Map(date -> severity)
  for (const c of rawComponents) {
    historyByComponent.set(c.id, buildEmptyHistory(HISTORY_DAYS));
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - HISTORY_DAYS);

  for (const incident of allIncidents) {
    const impact = IMPACT_MAP[incident.impact] || IMPACT_MAP.none;
    if (impact.severity === 0) continue;

    const start = new Date(incident.created_at);
    const end = incident.resolved_at ? new Date(incident.resolved_at) : new Date();
    if (end < cutoff) continue; // incident trop ancien, hors fenêtre

    const affectedIds = (incident.components || []).map((c) => c.id);

    for (const compId of affectedIds) {
      const hist = historyByComponent.get(compId);
      if (!hist) continue;

      const cursor = new Date(Math.max(start, cutoff));
      while (cursor <= end) {
        const key = dayKey(cursor.toISOString());
        if (hist.has(key)) {
          hist.set(key, Math.max(hist.get(key), impact.severity));
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
  }

  function severityToClass(sev) {
    if (sev >= 3) return "maj";
    if (sev >= 2) return "part";
    if (sev >= 1) return "deg";
    return "op";
  }

  function historySlice(fullHistoryArray, days) {
    return fullHistoryArray.slice(-days);
  }

  // 4) Assemblage des composants prêts à afficher
  const components = rawComponents.map((c) => {
    const statusInfo = STATUS_MAP[c.status] || STATUS_MAP.operational;
    const histMap = historyByComponent.get(c.id);
    const fullHistory = Array.from(histMap.entries()).map(([date, sev]) => ({
      date,
      class: severityToClass(sev),
    }));

    return {
      id: c.id,
      name: c.name,
      short_name: COMPONENT_SHORT_NAMES[c.name],
      status_class: statusInfo.class,
      status_label: statusInfo.label,
      history_7: historySlice(fullHistory, 7),
      history_30: historySlice(fullHistory, 30),
      history_90: historySlice(fullHistory, 90),
    };
  });

  // 5) Incidents non résolus, mis en forme pour l'écran B
  const STEP_ORDER = ["investigating", "identified", "monitoring", "resolved"];

  const incidents = unresolvedIncidents.map((incident) => {
    const currentStepIndex = STEP_ORDER.indexOf(incident.status);
    const steps = STEP_ORDER.map((step, i) => ({
      name: step,
      label: step.charAt(0).toUpperCase() + step.slice(1),
      state: i < currentStepIndex ? "done" : i === currentStepIndex ? "now" : "pending",
    }));

    const updates = (incident.incident_updates || [])
      .slice() // copie
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) // plus récent d'abord
      .map((u) => ({
        status: u.status,
        status_label: u.status.charAt(0).toUpperCase() + u.status.slice(1),
        body: u.body,
        created_at: u.created_at,
        time_label: new Date(u.created_at).toISOString().slice(11, 16) + " UTC",
      }));

    return {
      id: incident.id,
      name: incident.name,
      impact: incident.impact,
      status_class: (IMPACT_MAP[incident.impact] || IMPACT_MAP.none).class,
      created_at: incident.created_at,
      started_label:
        new Date(incident.created_at).toISOString().slice(0, 10) +
        " · depuis " +
        new Date(incident.created_at).toISOString().slice(11, 16) +
        " UTC",
      affected_component_ids: (incident.components || []).map((c) => c.id),
      steps,
      updates,
    };
  });

  // 6) Statut global (indicator: none/minor/major/critical)
  const statusRes = await fetchJson(`${API_BASE}/status.json`);

  const output = {
    generated_at: new Date().toISOString(),
    overall: {
      indicator: statusRes.status.indicator,
      description: statusRes.status.description,
    },
    components,
    incidents,
    has_active_incident: incidents.length > 0,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`OK — écrit ${OUTPUT_PATH} (${components.length} composants, ${incidents.length} incident(s) actif(s))`);
}

main().catch((err) => {
  console.error("Échec du fetch GitHub Status :", err);
  process.exit(1);
});
