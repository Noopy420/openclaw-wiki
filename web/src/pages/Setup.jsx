import React, { useEffect, useState } from "react";
import { api } from "../api.js";

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function formatDuration(ms) {
  if (!ms) return "—";
  if (ms < 1000) return ms + " ms";
  if (ms < 60_000) return (ms / 1000).toFixed(1) + " s";
  return (ms / 60_000).toFixed(1) + " min";
}

function StatusDot({ status }) {
  const map = {
    ready: { color: "#2a7a2a", label: "ready" },
    ok: { color: "#2a7a2a", label: "ok" },
    "needs-config": { color: "#b27828", label: "needs config" },
    "missing-bin": { color: "#b32424", label: "missing" },
    missing: { color: "#b32424", label: "missing" },
    unknown: { color: "#888", label: "?" },
  };
  const s = map[status] || map.unknown;
  return (
    <span className="oc-status-dot" title={s.label}>
      <span
        className="oc-status-dot-glyph"
        style={{ background: s.color }}
        aria-hidden
      />
      <span className="oc-status-dot-label">{s.label}</span>
    </span>
  );
}

function Section({ title, children, right }) {
  return (
    <section className="oc-setup-section">
      <header className="oc-setup-section-head">
        <h2>{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

function Row({ label, value, mono, status }) {
  return (
    <div className="oc-setup-row">
      <div className="oc-setup-label">{label}</div>
      <div className={"oc-setup-value" + (mono ? " oc-mono" : "")}>
        {status && <StatusDot status={status} />}
        {value}
      </div>
    </div>
  );
}

export default function Setup() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .setup()
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="oc-loading">loading setup report…</div>;
  if (err) return <div className="oc-error">error: {err}</div>;
  if (!data?.ok) {
    return <div className="oc-error">setup unavailable: {data?.error || "unknown"}</div>;
  }

  const {
    version,
    gateway,
    models,
    agents,
    channels,
    plugins,
    skills,
    cron,
    extensions,
    dependencies,
    openclawHome,
  } = data;

  const filteredSkills = (skills?.skills || []).filter((s) =>
    !filter
      ? true
      : s.name.toLowerCase().includes(filter.toLowerCase()) ||
        (s.description || "").toLowerCase().includes(filter.toLowerCase())
  );

  const skillsByStatus = {};
  (skills?.skills || []).forEach((s) => {
    skillsByStatus[s.status] = (skillsByStatus[s.status] || 0) + 1;
  });

  return (
    <div className="oc-setup">
      <header className="oc-article-header">
        <h1 className="oc-title">OpenClaw setup &amp; configuration</h1>
        <p className="oc-article-meta">
          Read-only snapshot of <code>{openclawHome}</code> — generated {formatDate(data.generatedAt)}.
          Refresh the page to re-scan.
        </p>
      </header>

      {/* ---- Overview ---- */}
      <Section title="Overview">
        <Row
          label="Installed version"
          value={
            <>
              {version?.installed?.version || "unknown"}
              {version?.installed?.path && (
                <span className="oc-setup-hint"> ({version.installed.path})</span>
              )}
            </>
          }
        />
        <Row
          label="Config last-touched"
          value={`${version?.lastTouchedVersion || "—"} on ${formatDate(version?.lastTouchedAt)}`}
        />
        <Row
          label="Wizard last run"
          value={
            version?.wizard
              ? `${version.wizard.lastRunCommand} on ${formatDate(version.wizard.lastRunAt)} (v${version.wizard.lastRunVersion})`
              : "—"
          }
        />
      </Section>

      {/* ---- Dependencies ---- */}
      <Section title="Dependencies">
        {dependencies.map((d) => (
          <div key={d.name} className="oc-setup-row">
            <div className="oc-setup-label">
              <strong>{d.name}</strong>
              <div className="oc-setup-hint">{d.purpose}</div>
            </div>
            <div className="oc-setup-value">
              <StatusDot status={d.status} />
              {d.version && <span className="oc-setup-hint">{d.version}</span>}
              {d.status !== "ready" && d.howToFix && (
                <div className="oc-setup-hint oc-warn">{d.howToFix}</div>
              )}
              {d.reason && (
                <div className="oc-setup-hint oc-warn">{d.reason}</div>
              )}
            </div>
          </div>
        ))}
      </Section>

      {/* ---- Gateway ---- */}
      <Section title="Gateway">
        <Row
          label="Runtime"
          value={
            gateway.runtime?.reachable
              ? `running at ${gateway.runtime.url}`
              : `unreachable: ${gateway.runtime?.error || gateway.runtime?.status || "no response"}`
          }
          status={gateway.runtime?.reachable ? "ready" : "missing"}
        />
        {gateway.config && (
          <>
            <Row label="Port" value={gateway.config.port} mono />
            <Row label="Mode" value={gateway.config.mode} />
            <Row label="Bind" value={gateway.config.bind} />
            <Row label="Auth mode" value={gateway.config.authMode} />
            <Row
              label="Token"
              value={
                <>
                  {gateway.config.tokenMasked || "(none)"}
                  <span className="oc-setup-hint"> masked</span>
                </>
              }
              mono
            />
            <Row label="Tailscale" value={gateway.config.tailscale} />
            <Row
              label="Device auth"
              value={
                gateway.config.controlUi?.dangerouslyDisableDeviceAuth
                  ? "DISABLED (dangerouslyDisableDeviceAuth=true)"
                  : "enabled"
              }
              status={
                gateway.config.controlUi?.dangerouslyDisableDeviceAuth
                  ? "needs-config"
                  : "ready"
              }
            />
            <Row
              label="Node command denylist"
              value={
                gateway.config.nodes?.denyCommands?.length
                  ? gateway.config.nodes.denyCommands.join(", ")
                  : "(none)"
              }
              mono
            />
          </>
        )}
      </Section>

      {/* ---- Models ---- */}
      <Section title="Models">
        <Row
          label="Primary"
          value={<code>{models.primary || "(none)"}</code>}
          status={
            models.missingRefs.includes(models.primary) ? "missing" : "ready"
          }
        />
        <Row
          label="Fallbacks"
          value={
            models.fallbacks.length ? (
              <ul className="oc-inline-list">
                {models.fallbacks.map((f) => (
                  <li key={f}>
                    <code>{f}</code>
                    {models.missingRefs.includes(f) && (
                      <span className="oc-warn"> (not defined!)</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              "(none)"
            )
          }
        />
        {models.missingRefs.length > 0 && (
          <div className="oc-setup-warn">
            ⚠ {models.missingRefs.length} referenced model(s) are not defined
            in <code>models.providers</code>. This causes request failures.
          </div>
        )}

        <div className="oc-setup-providers">
          {models.providers.map((p) => (
            <div key={p.id} className="oc-setup-provider">
              <h3>
                {p.id}{" "}
                <span className="oc-setup-hint">
                  {p.api} · {p.baseUrl}
                </span>
                {p.apiKeySet ? (
                  <span className="oc-setup-ok"> · key set ({p.apiKeyMasked})</span>
                ) : (
                  <span className="oc-warn"> · no API key</span>
                )}
              </h3>
              <ul className="oc-model-list">
                {p.models.map((m) => (
                  <li key={m.fullId}>
                    <code>{m.fullId}</code>
                    {m.isPrimary && <span className="oc-pill oc-pill-primary"> primary</span>}
                    {m.isFallback && <span className="oc-pill oc-pill-fallback"> fallback</span>}
                    {m.reasoning && <span className="oc-pill"> reasoning</span>}
                    {m.contextWindow && (
                      <span className="oc-setup-hint"> ctx {m.contextWindow.toLocaleString()}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Agents ---- */}
      <Section title="Agents">
        <table className="oc-setup-table">
          <thead>
            <tr>
              <th>id</th>
              <th>configured</th>
              <th>on disk</th>
              <th>model</th>
              <th>workspace</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td>
                  <strong>{a.id}</strong>
                  {a.name && a.name !== a.id && (
                    <span className="oc-setup-hint"> “{a.name}”</span>
                  )}
                </td>
                <td>{a.configured ? "✓" : "—"}</td>
                <td>{a.onDisk ? "✓" : "—"}</td>
                <td>{a.model && <code>{a.model}</code>}</td>
                <td>
                  {a.workspace && (
                    <code className="oc-setup-hint">{a.workspace}</code>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ---- Channels ---- */}
      <Section title="Channels">
        {channels.length === 0 && <p className="oc-setup-hint">No channels configured.</p>}
        {channels.map((c) => (
          <div key={c.id} className="oc-setup-row">
            <div className="oc-setup-label">
              <strong>{c.id}</strong>
              <div className="oc-setup-hint">
                {c.enabled ? "enabled" : "disabled"}
                {c.groupPolicy ? ` · policy: ${c.groupPolicy}` : ""}
              </div>
            </div>
            <div className="oc-setup-value">
              <StatusDot status={c.hasToken || c.accounts?.some((a) => a.hasToken) ? "ready" : "needs-config"} />
              {c.guildCount > 0 && <span className="oc-setup-hint"> {c.guildCount} guilds · </span>}
              {c.accounts?.length
                ? `${c.accounts.length} accounts`
                : c.hasToken
                ? `token ${c.tokenMasked}`
                : "no credentials"}
            </div>
          </div>
        ))}
      </Section>

      {/* ---- Plugins ---- */}
      <Section title="Plugins">
        <table className="oc-setup-table">
          <thead>
            <tr>
              <th>id</th>
              <th>will load?</th>
              <th>enabled in config</th>
              <th>in allowlist</th>
              <th>has config block</th>
              <th>notes</th>
            </tr>
          </thead>
          <tbody>
            {plugins.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.id}</strong>
                </td>
                <td>
                  <StatusDot status={p.willLoad ? "ready" : "needs-config"} />
                </td>
                <td>{p.configuredEnabled ? "✓" : "—"}</td>
                <td>{p.inAllowlist ? "✓" : "—"}</td>
                <td>{p.hasConfig ? "✓" : "—"}</td>
                <td className="oc-setup-hint">{p.note || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ---- Skills ---- */}
      <Section
        title={`Skills (${skills?.skills?.length || 0})`}
        right={
          <div className="oc-setup-filter">
            <span className="oc-setup-hint">
              ✓ {skillsByStatus.ready || 0} ready ·{" "}
              ⚠ {skillsByStatus["needs-config"] || 0} needs config ·{" "}
              ✗ {skillsByStatus["missing-bin"] || 0} missing bin
            </span>
            <input
              type="search"
              placeholder="filter skills…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        }
      >
        <table className="oc-setup-table oc-skills-table">
          <thead>
            <tr>
              <th>skill</th>
              <th>status</th>
              <th>requires</th>
              <th>configured</th>
              <th>notes</th>
            </tr>
          </thead>
          <tbody>
            {filteredSkills.map((s) => (
              <tr key={s.name}>
                <td>
                  <strong>
                    {s.emoji ? s.emoji + " " : ""}
                    {s.name}
                  </strong>
                  <div className="oc-setup-hint">{s.description}</div>
                </td>
                <td>
                  <StatusDot status={s.status} />
                </td>
                <td className="oc-setup-hint">
                  {s.binStatus.length > 0 && (
                    <div>
                      bins:{" "}
                      {s.binStatus.map((b) => (
                        <code
                          key={b.name}
                          className={b.found ? "oc-ok" : "oc-warn"}
                        >
                          {b.found ? "✓" : "✗"} {b.name}
                        </code>
                      ))}
                    </div>
                  )}
                  {s.envStatus.length > 0 && (
                    <div>
                      env:{" "}
                      {s.envStatus.map((e) => (
                        <code
                          key={e.name}
                          className={e.set ? "oc-ok" : "oc-warn"}
                        >
                          {e.set ? "✓" : "✗"} {e.name}
                        </code>
                      ))}
                    </div>
                  )}
                </td>
                <td>{s.configured ? (s.hasApiKey ? "✓ key" : "✓") : "—"}</td>
                <td className="oc-setup-hint">{s.reasons.join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {skills?.skillsDir && (
          <p className="oc-setup-hint">
            Scanned: <code>{skills.skillsDir}</code>
          </p>
        )}
      </Section>

      {/* ---- Cron jobs ---- */}
      <Section title={`Cron jobs (${cron.length})`}>
        {cron.length === 0 && (
          <p className="oc-setup-hint">No cron jobs configured.</p>
        )}
        {cron.map((j) => (
          <div key={j.id} className="oc-setup-cron-job">
            <div className="oc-setup-cron-head">
              <strong>{j.name || "(unnamed)"}</strong>
              <StatusDot status={j.enabled ? (j.lastRunStatus === "ok" ? "ok" : j.lastRunStatus ? "missing" : "needs-config") : "needs-config"} />
              <code className="oc-setup-hint">{j.schedule?.expr} ({j.schedule?.tz})</code>
            </div>
            <div className="oc-setup-row">
              <div className="oc-setup-label">Agent</div>
              <div className="oc-setup-value">
                <code>{j.agentId}</code>
                {j.model && (
                  <>
                    {" · "}
                    <code>{j.model}</code>
                  </>
                )}
              </div>
            </div>
            <div className="oc-setup-row">
              <div className="oc-setup-label">Last / next run</div>
              <div className="oc-setup-value">
                {formatDate(j.lastRunAtMs)} · duration {formatDuration(j.lastDurationMs)}{" "}
                · status <strong>{j.lastRunStatus || "—"}</strong> · delivery{" "}
                <strong>{j.lastDeliveryStatus || "—"}</strong>
                <div className="oc-setup-hint">next: {formatDate(j.nextRunAtMs)}</div>
              </div>
            </div>
            <div className="oc-setup-row">
              <div className="oc-setup-label">Delivery</div>
              <div className="oc-setup-value">
                <code>{j.delivery?.channel}:{j.delivery?.to}</code>
                <span className="oc-setup-hint"> ({j.delivery?.mode})</span>
              </div>
            </div>
            {j.messagePreview && (
              <div className="oc-setup-row">
                <div className="oc-setup-label">Message</div>
                <div className="oc-setup-value oc-mono oc-pre">
                  {j.messagePreview}
                  {j.messagePreview.length >= 160 && "…"}
                </div>
              </div>
            )}
            {j.consecutiveErrors > 0 && (
              <div className="oc-setup-warn">
                ⚠ {j.consecutiveErrors} consecutive errors
              </div>
            )}
          </div>
        ))}
      </Section>

      {/* ---- Extensions ---- */}
      {extensions.length > 0 && (
        <Section title="Extensions">
          {extensions.map((e) => (
            <div key={e.name} className="oc-setup-row">
              <div className="oc-setup-label">
                <strong>{e.name}</strong>
                <div className="oc-setup-hint">
                  <code>{e.path}</code>
                </div>
              </div>
              <div className="oc-setup-value">
                <StatusDot
                  status={
                    e.hasPythonProject
                      ? e.venvReady
                        ? "ready"
                        : "needs-config"
                      : "ready"
                  }
                />
                {e.hasNodePkg && <span className="oc-setup-hint">node pkg · </span>}
                {e.hasPythonProject && (
                  <span className="oc-setup-hint">
                    python {e.venvReady ? "venv ✓" : "venv missing"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
