import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import ArticleFilters from "../components/ArticleFilters.jsx";

// URL-backed filter state — links stay bookmarkable.
function useUrlParam(key, initial) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? initial;
  const setValue = (v) => {
    const next = new URLSearchParams(params);
    if (v === null || v === undefined || v === "" || v === initial) {
      next.delete(key);
    } else {
      next.set(key, String(v));
    }
    setParams(next, { replace: true });
  };
  return [value, setValue];
}

function groupArticles(articles, groupBy) {
  if (!groupBy || groupBy === "none") return [{ label: null, items: articles }];
  const buckets = new Map();
  const keyFn = {
    namespace: (a) => a.namespace || "—",
    agent: (a) => a.agent || "(no agent)",
    letter: (a) => (a.title?.[0] || "#").toUpperCase(),
  }[groupBy];
  if (!keyFn) return [{ label: null, items: articles }];
  for (const a of articles) {
    const k = keyFn(a);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(a);
  }
  return [...buckets.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([label, items]) => ({ label, items }));
}

function sortArticles(articles, sortBy) {
  const clone = [...articles];
  const cmp = {
    title: (a, b) => a.title.localeCompare(b.title),
    "title-desc": (a, b) => b.title.localeCompare(a.title),
    "updated-desc": (a, b) => (b.updated || 0) - (a.updated || 0),
    "updated-asc": (a, b) => (a.updated || 0) - (b.updated || 0),
    agent: (a, b) =>
      (a.agent || "").localeCompare(b.agent || "") ||
      a.title.localeCompare(b.title),
    namespace: (a, b) =>
      (a.namespace || "").localeCompare(b.namespace || "") ||
      a.title.localeCompare(b.title),
  }[sortBy];
  if (cmp) clone.sort(cmp);
  return clone;
}

export default function Home() {
  const [sortBy, setSortBy] = useUrlParam("sort", "title");
  const [groupBy, setGroupBy] = useUrlParam("group", "none");
  const [agentFilter, setAgentFilter] = useUrlParam("agent", "");
  const [namespaceFilter, setNamespaceFilter] = useUrlParam("namespace", "");
  const [textFilterRaw, setTextFilter] = useUrlParam("q", "");
  const [editableParam, setEditableOnlyRaw] = useUrlParam("editable", "");

  const textFilter = textFilterRaw || "";
  const editableOnly = editableParam === "1";

  const [status, setStatus] = useState(null);
  const [all, setAll] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.status().then(setStatus).catch((e) => setErr(e.message));
    api.articles().then((r) => setAll(r.articles || [])).catch((e) => setErr(e.message));
  }, []);

  const filtered = useMemo(() => {
    let list = all;
    if (agentFilter) list = list.filter((a) => a.agent === agentFilter);
    if (namespaceFilter) list = list.filter((a) => a.namespace === namespaceFilter);
    if (editableOnly) list = list.filter((a) => a.editable);
    if (textFilter) {
      const q = textFilter.toLowerCase();
      list = list.filter(
        (a) =>
          a.title?.toLowerCase().includes(q) ||
          a.summary?.toLowerCase().includes(q)
      );
    }
    return sortArticles(list, sortBy);
  }, [all, agentFilter, namespaceFilter, editableOnly, textFilter, sortBy]);

  const grouped = useMemo(() => groupArticles(filtered, groupBy), [filtered, groupBy]);

  if (err) return <div className="oc-error">error: {err}</div>;

  return (
    <div className="oc-home">
      <header className="oc-article-header">
        <h1 className="oc-title">
          {namespaceFilter ? `${namespaceFilter} articles` : "OpenClaw Memory Wiki"}
        </h1>
        {status && (
          <p className="oc-subtitle">
            {status.articles.toLocaleString()} articles across{" "}
            {(status.agents || []).length} agent
            {(status.agents || []).length === 1 ? "" : "s"}.
          </p>
        )}
      </header>

      {!namespaceFilter && !textFilter && !agentFilter && (
        <section className="oc-welcome">
          <p>
            This is a human-readable view of the memories, identities, and
            dream-diary entries stored by your OpenClaw agents. Use the filter
            bar below to narrow down, or the search bar at the top of the page
            for full-text search.
          </p>
        </section>
      )}

      <ArticleFilters
        articles={all}
        sortBy={sortBy}
        onSortBy={setSortBy}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        agentFilter={agentFilter}
        onAgentFilter={setAgentFilter}
        namespaceFilter={namespaceFilter}
        onNamespaceFilter={setNamespaceFilter}
        editableOnly={editableOnly}
        onEditableOnly={(v) => setEditableOnlyRaw(v ? "1" : "")}
        textFilter={textFilter}
        onTextFilter={setTextFilter}
      />

      <div className="oc-home-meta">
        <strong>{filtered.length}</strong>
        {filtered.length === all.length ? " articles" : ` of ${all.length} articles`}
        {filtered.length > 0 && groupBy !== "none" && (
          <> in {grouped.length} group{grouped.length === 1 ? "" : "s"}</>
        )}
        {(textFilter || agentFilter || namespaceFilter || editableOnly) && (
          <>
            {" · "}
            <button
              className="oc-linkbutton"
              onClick={() => {
                setTextFilter("");
                setAgentFilter(null);
                setNamespaceFilter(null);
                setEditableOnlyRaw("");
              }}
            >
              Clear filters
            </button>
          </>
        )}
      </div>

      {grouped.map(({ label, items }) => (
        <section key={label ?? "__flat__"} className="oc-group">
          {label && (
            <h2 className="oc-group-heading">
              {label} <small>({items.length})</small>
            </h2>
          )}
          <ul className="oc-article-list">
            {items.map((a) => (
              <li key={a.id}>
                <Link to={`/wiki/${encodeURIComponent(a.id)}`}>
                  <span className={`oc-ns oc-ns-${a.namespace?.toLowerCase()}`}>
                    {a.namespace}
                  </span>
                  {a.title}
                </Link>
                {a.agent && groupBy !== "agent" && (
                  <span className="oc-setup-hint"> · {a.agent}</span>
                )}
                {a.summary && (
                  <p className="oc-article-teaser">{a.summary.slice(0, 200)}…</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {filtered.length === 0 && (
        <p className="oc-setup-hint">
          No articles match the current filters.
        </p>
      )}
    </div>
  );
}
