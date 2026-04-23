import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    api.search(q).then((r) => {
      setResults(r.results || []);
      setLoading(false);
    });
  }, [q]);

  return (
    <div className="oc-search-page">
      <h1>Search results</h1>
      <p className="oc-subtitle">
        for <strong>{q || "—"}</strong>
      </p>

      {loading && <p>searching…</p>}

      {!loading && results.length === 0 && q && <p>No results.</p>}

      <ul className="oc-search-results">
        {results.map((r, i) => (
          <li key={i}>
            {r.articleId ? (
              <Link to={`/wiki/${encodeURIComponent(r.articleId)}`} className="oc-hit-title">
                <span className={`oc-ns oc-ns-${r.namespace?.toLowerCase()}`}>
                  {r.namespace}
                </span>
                {r.title}
              </Link>
            ) : (
              <span className="oc-hit-title oc-hit-orphan">
                <span className="oc-ns oc-ns-chunk">{r.namespace}</span>
                {r.title}
              </span>
            )}
            <p
              className="oc-snippet"
              dangerouslySetInnerHTML={{ __html: r.snippet }}
            />
            <p className="oc-hit-meta">
              score {r.score} · {r.source}
              {r.agent && <> · agent: {r.agent}</>}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
