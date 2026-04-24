// Setup / config inspector.
//
// Read-only view into the state of the OpenClaw install. Reads the same
// files the CLI reads — openclaw.json, cron/jobs*.json, skills/*/SKILL.md —
// and computes status for each thing (healthy, needs config, broken).
//
// Nothing in this module mutates disk.

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import { config } from "./config.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readJsonSafe(p) {
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function dirListSafe(dir, { files = false, dirs = false } = {}) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => (files && e.isFile()) || (dirs && e.isDirectory()))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function maskKey(value) {
  if (!value || typeof value !== "string") return null;
  if (value.length <= 10) return value.slice(0, 2) + "…";
  return value.slice(0, 6) + "…" + value.slice(-4);
}

function hasBinOnPath(binName) {
  // Best-effort synchronous check — splits PATH and looks for a file with
  // the given name plus common Windows extensions.
  const pathEnv = process.env.PATH || process.env.Path || "";
  const sep = process.platform === "win32" ? ";" : ":";
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, binName + ext);
      try {
        const stat = fsSync.statSync(full);
        if (stat.isFile()) return full;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Individual sections
// ---------------------------------------------------------------------------

async function readOpenclawConfig() {
  const p = path.join(config.openclawHome, "openclaw.json");
  return await readJsonSafe(p);
}

async function getVersionInfo(ocJson) {
  // Look up installed openclaw version from its package.json.
  const candidates = [
    path.join(os.homedir(), "..", "..", "npm-global", "node_modules", "openclaw", "package.json"),
    "C:/npm-global/node_modules/openclaw/package.json",
    path.join(os.homedir(), ".npm-global", "lib", "node_modules", "openclaw", "package.json"),
  ];
  let installed = null;
  for (const c of candidates) {
    const pkg = await readJsonSafe(c);
    if (pkg?.version) {
      installed = { version: pkg.version, path: c };
      break;
    }
  }
  return {
    installed,
    lastTouchedVersion: ocJson?.meta?.lastTouchedVersion || null,
    lastTouchedAt: ocJson?.meta?.lastTouchedAt || null,
    wizard: ocJson?.wizard || null,
  };
}

function summarizeGateway(ocJson) {
  const g = ocJson?.gateway;
  if (!g) return null;
  return {
    port: g.port,
    mode: g.mode,
    bind: g.bind,
    tailscale: g.tailscale?.mode || "off",
    authMode: g.auth?.mode || "none",
    tokenMasked: maskKey(g.auth?.token),
    controlUi: {
      allowedOrigins: g.controlUi?.allowedOrigins || [],
      dangerouslyDisableDeviceAuth: !!g.controlUi?.dangerouslyDisableDeviceAuth,
    },
    nodes: {
      denyCommands: g.nodes?.denyCommands || [],
    },
  };
}

async function probeGateway(ocJson) {
  // Hit the gateway's /health endpoint — it's HTTP on the same port as WS.
  const port = ocJson?.gateway?.port || 18789;
  const url = `http://127.0.0.1:${port}/health`;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1200);
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    return { reachable: r.ok, status: r.status, url };
  } catch (err) {
    return { reachable: false, error: String(err?.message || err), url };
  }
}

function summarizeModels(ocJson) {
  const providers = ocJson?.models?.providers || {};
  const agentDefaults = ocJson?.agents?.defaults || {};
  const primary = agentDefaults?.model?.primary || null;
  const fallbacks = agentDefaults?.model?.fallbacks || [];

  const byProvider = Object.entries(providers).map(([pid, p]) => {
    const models = Array.isArray(p.models) ? p.models : [];
    return {
      id: pid,
      baseUrl: p.baseUrl,
      api: p.api,
      apiKeySet: !!p.apiKey,
      apiKeyMasked: maskKey(p.apiKey),
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        reasoning: !!m.reasoning,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        input: m.input,
        fullId: `${pid}/${m.id}`,
        isPrimary: primary === `${pid}/${m.id}`,
        isFallback: fallbacks.includes(`${pid}/${m.id}`),
      })),
    };
  });

  const allDefined = new Set();
  for (const p of byProvider) for (const m of p.models) allDefined.add(m.fullId);

  // Is every referenced model actually defined? (This caught the earlier
  // :27b bug.)
  const allRefs = [primary, ...fallbacks].filter(Boolean);
  const missingRefs = allRefs.filter((r) => !allDefined.has(r));

  return {
    primary,
    fallbacks,
    providers: byProvider,
    missingRefs,
    totalModels: [...allDefined].length,
  };
}

async function getAgentsSummary(ocJson) {
  const configList = ocJson?.agents?.list || [];
  const dirs = await dirListSafe(config.agentsDir, { dirs: true });
  const merged = new Map();
  for (const d of dirs) {
    merged.set(d, { id: d, configured: false, onDisk: true });
  }
  for (const a of configList) {
    const prior = merged.get(a.id) || { id: a.id, onDisk: false };
    merged.set(a.id, {
      ...prior,
      configured: true,
      name: a.name,
      model: a.model || ocJson?.agents?.defaults?.model?.primary || null,
      workspace: a.workspace || ocJson?.agents?.defaults?.workspace || null,
    });
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function getChannels(ocJson) {
  const ch = ocJson?.channels || {};
  const out = [];
  for (const [id, cfg] of Object.entries(ch)) {
    const token = cfg?.token || cfg?.accounts?.default?.token;
    const accounts = cfg?.accounts
      ? Object.keys(cfg.accounts).map((k) => ({
          name: k,
          hasToken: !!cfg.accounts[k]?.token,
          streaming: cfg.accounts[k]?.streaming,
        }))
      : [];
    out.push({
      id,
      enabled: cfg?.enabled !== false,
      groupPolicy: cfg?.groupPolicy,
      streaming: cfg?.streaming?.mode || cfg?.streaming,
      hasToken: !!token,
      tokenMasked: token ? maskKey(token) : null,
      guildCount: cfg?.guilds ? Object.keys(cfg.guilds).length : 0,
      accounts,
    });
  }
  return out;
}

// Context strings for plugins that are expected to run with defaults or get
// their config from somewhere other than plugins.entries. Having no entry
// block for these is normal, not a warning.
const DEFAULTS_ONLY_NOTE = "Using built-in defaults";
const KNOWN_PLUGIN_NOTES = {
  "memory-core":
    "Core memory pipeline — runs with built-in defaults (uses the configured embedding provider).",
  "memory-wiki":
    "Compiles the memory palace — runs with built-in defaults.",
  discord: "Config lives under `channels.discord`, not plugins.entries.",
  telegram: "Config lives under `channels.telegram`, not plugins.entries.",
  "metaclaw-openclaw":
    "Loaded from the `extensions/` directory; its config is internal to the extension.",
};

async function getPluginsSummary(ocJson) {
  const entries = ocJson?.plugins?.entries || {};
  const allow = ocJson?.plugins?.allow || [];
  const allowSet = new Set(allow);
  const out = Object.entries(entries).map(([id, p]) => ({
    id,
    configuredEnabled: p?.enabled !== false,
    inAllowlist: allowSet.has(id),
    willLoad: p?.enabled !== false && allowSet.has(id),
    hasConfig: !!p?.config && Object.keys(p.config).length > 0,
    defaultsOnly: false,
  }));
  // Include allowlisted plugins that don't have explicit config. These are
  // NOT broken — they just use defaults.
  for (const a of allow) {
    if (!entries[a]) {
      out.push({
        id: a,
        configuredEnabled: true,
        inAllowlist: true,
        willLoad: true,
        hasConfig: false,
        defaultsOnly: true,
        note: KNOWN_PLUGIN_NOTES[a] || DEFAULTS_ONLY_NOTE,
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function findOpenclawSkillsDir() {
  // Builtin skills live next to the openclaw package.
  const candidates = [
    "C:/npm-global/node_modules/openclaw/skills",
    path.join(os.homedir(), ".npm-global", "lib", "node_modules", "openclaw", "skills"),
    "/usr/local/lib/node_modules/openclaw/skills",
  ];
  for (const c of candidates) {
    if (await exists(c)) return c;
  }
  return null;
}

async function getSkillsSummary(ocJson) {
  const skillsDir = await findOpenclawSkillsDir();
  const userEntries = ocJson?.skills?.entries || {};
  if (!skillsDir) return { skillsDir: null, skills: [] };

  const names = await dirListSafe(skillsDir, { dirs: true });
  const skills = [];
  for (const name of names) {
    const skillMd = path.join(skillsDir, name, "SKILL.md");
    let meta = null;
    let desc = "";
    let emoji = "";
    let requires = { bins: [], env: [] };
    try {
      const raw = await fs.readFile(skillMd, "utf-8");
      const parsed = matter(raw);
      desc = parsed.data?.description || "";
      emoji = parsed.data?.metadata?.openclaw?.emoji || "";
      requires = parsed.data?.metadata?.openclaw?.requires || requires;
      meta = parsed.data?.metadata?.openclaw || {};
    } catch {
      // Skill without a SKILL.md — still list it.
    }

    const binStatus = (requires.bins || []).map((b) => ({
      name: b,
      found: !!hasBinOnPath(b),
    }));
    const envStatus = (requires.env || []).map((e) => ({
      name: e,
      set: !!process.env[e],
    }));

    const configured = !!userEntries[name];
    const userCfg = userEntries[name] || {};
    const hasApiKey = !!userCfg?.apiKey;

    const allBinsOK = binStatus.every((b) => b.found);
    const allEnvOK = envStatus.every((e) => e.set || hasApiKey);

    let status = "ready";
    const reasons = [];
    if (!allBinsOK) {
      status = "missing-bin";
      reasons.push(
        "missing " +
          binStatus
            .filter((b) => !b.found)
            .map((b) => b.name)
            .join(", ")
      );
    }
    if (!allEnvOK) {
      status = status === "ready" ? "needs-config" : status;
      reasons.push(
        "needs env/api key: " +
          envStatus
            .filter((e) => !e.set)
            .map((e) => e.name)
            .join(", ")
      );
    }

    skills.push({
      name,
      emoji,
      description: desc,
      requires,
      binStatus,
      envStatus,
      configured,
      hasApiKey,
      status,
      reasons,
      installHints: meta?.install || [],
    });
  }
  return { skillsDir, skills: skills.sort((a, b) => a.name.localeCompare(b.name)) };
}

async function getCronSummary() {
  const jobsPath = path.join(config.openclawHome, "cron", "jobs.json");
  const statePath = path.join(config.openclawHome, "cron", "jobs-state.json");
  const jobsFile = await readJsonSafe(jobsPath);
  const stateFile = await readJsonSafe(statePath);
  const state = stateFile?.jobs || {};
  const jobs = jobsFile?.jobs || [];
  return jobs.map((j) => {
    const s = state[j.id] || {};
    return {
      id: j.id,
      name: j.name,
      agentId: j.agentId,
      enabled: j.enabled !== false,
      schedule: j.schedule,
      sessionTarget: j.sessionTarget,
      delivery: j.delivery,
      model: j.payload?.model,
      messagePreview: (j.payload?.message || "").slice(0, 160),
      lastRunAtMs: s.lastRunAtMs || null,
      nextRunAtMs: s.nextRunAtMs || null,
      lastRunStatus: s.lastRunStatus || null,
      lastDeliveryStatus: s.lastDeliveryStatus || null,
      lastDurationMs: s.lastDurationMs || null,
      consecutiveErrors: s.consecutiveErrors || 0,
    };
  });
}

async function getExtensionsSummary() {
  const extRoot = path.join(config.openclawHome, "extensions");
  const names = await dirListSafe(extRoot, { dirs: true });
  const out = [];
  for (const name of names) {
    const dir = path.join(extRoot, name);
    const hasVenv = await exists(path.join(dir, ".metaclaw"));
    const hasPkg = await exists(path.join(dir, "package.json"));
    const hasPy = await exists(path.join(dir, "pyproject.toml"));
    out.push({
      name,
      path: dir,
      venvReady: hasVenv,
      hasNodePkg: hasPkg,
      hasPythonProject: hasPy,
    });
  }
  return out;
}

async function getDependenciesSummary() {
  const deps = [];

  // better-sqlite3 — enables Chunk namespace.
  try {
    const mod = await import("better-sqlite3");
    deps.push({
      name: "better-sqlite3",
      purpose: "Enables the Chunk namespace (reads memory/*.sqlite)",
      installed: true,
      version: mod?.default ? mod.default.version : null,
      status: "ready",
    });
  } catch (err) {
    deps.push({
      name: "better-sqlite3",
      purpose: "Enables the Chunk namespace (reads memory/*.sqlite)",
      installed: false,
      status: "missing",
      reason: String(err?.message || err).split("\n")[0],
      howToFix:
        "Run `npm install better-sqlite3@latest` in the openclaw-wiki folder. " +
        "On Node 24 you need better-sqlite3 12.x+ which ships prebuilt Windows binaries.",
    });
  }

  // node binary for OpenClaw itself.
  deps.push({
    name: "node",
    purpose: "Runtime for OpenClaw itself",
    installed: true,
    version: process.version,
    status: "ready",
  });

  // Python — for metaclaw-openclaw extension venv.
  const py =
    hasBinOnPath("python3") ||
    hasBinOnPath("python") ||
    hasBinOnPath("py");
  deps.push({
    name: "python",
    purpose: "Required by the metaclaw-openclaw extension (creates a venv)",
    installed: !!py,
    path: py || null,
    status: py ? "ready" : "missing",
    howToFix: py ? undefined : "Install Python 3.10+ and ensure it's on PATH.",
  });

  return deps;
}

// ---------------------------------------------------------------------------
// Top-level aggregator
// ---------------------------------------------------------------------------

export async function buildSetupReport() {
  const ocJson = await readOpenclawConfig();
  if (!ocJson) {
    return {
      ok: false,
      error: "openclaw.json not found at " + path.join(config.openclawHome, "openclaw.json"),
    };
  }

  const [
    gatewayHealth,
    agents,
    channels,
    plugins,
    skills,
    cron,
    extensions,
    deps,
    version,
  ] = await Promise.all([
    probeGateway(ocJson),
    getAgentsSummary(ocJson),
    getChannels(ocJson),
    getPluginsSummary(ocJson),
    getSkillsSummary(ocJson),
    getCronSummary(),
    getExtensionsSummary(),
    getDependenciesSummary(),
    getVersionInfo(ocJson),
  ]);

  return {
    ok: true,
    generatedAt: Date.now(),
    openclawHome: config.openclawHome,
    version,
    gateway: {
      config: summarizeGateway(ocJson),
      runtime: gatewayHealth,
    },
    models: summarizeModels(ocJson),
    agents,
    channels,
    plugins,
    skills,
    cron,
    extensions,
    dependencies: deps,
  };
}
