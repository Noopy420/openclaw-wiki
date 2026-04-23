import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";

export default function Home() {
  const [params] = useSearchParams();
  const ns = params.get("namespace");
  const agent = params.get("agent");

  const [status, setStatus] = useState(null);
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.status().then(setStatus).catch((e) => setErr(e.message));
    const q = {};
    if (ns) q.namespace = ns;
    if (agent) q.agent = agent;
    api.articles(q).then((r) => setArticles(r.articles || [])).catch((e) => setErr(e.message));
    api.categories().then((r) => setCategories(r.categories || []));
  }, [ns, agent]);

  if (err) return <div className="oc-error">error: {err}</div>;

  return (
    <div className="oc-home">
      <header className="oc-article-header">
        <h1 className="oc-title">
          {ns ? `${ns} articles` : "OpenClaw Memory Wiki"}
        </h1>
        {status && (
          <p className="oc-subtitle">
            {status.articles.toLocaleString()} articles across{" "}
            {(status.agents || []).length} agent
            {(status.agents || []).length === 1 ? "" : "s"}.
          </p>
        )}
      </header>

      {!ns && (
        <section className="oc-welcome">
          <p>
            This is a human-readable view of the memories, identities, and
            dream-diary entries stored by your OpenClaw agents. Use the search
            bar above, or browse by namespace in the sidebar.
          </p>
        </section>
      )}

      <section>
        <h2>
          {ns ? "Articles" : "All articles"}
          <small> ({articles.length})</small>
        </h2>
        <ul className="oc-article-list">
          {articles.map((a) => (
            <li key={a.id}>
              <Link to={`/wiki/${encodeURIComponent(a.id)}`}>
                <span className={`oc-ns oc-ns-${a.namespace?.toLowerCase()}`}>
                  {a.namespace}
                </span>
                {a.title}
              </Link>
              {a.summary && <p className="oc-article-teaser">{a.summary.slice(0, 200)}…</p>}
            </li>
          ))}
        </ul>
      </section>

      {!ns && categories.length > 0 && (
        <section>
          <h2>Categories</h2>
          <ul className="oc-category-cloud">
            {categories.slice(0, 40).map((c) => (
              <li key={c.name}>
                <Link to={`/category/${encodeURIComponent(c.name)}`}>
                  {c.name} <em>({c.count})</em>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
