import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default function Recent() {
  const [articles, setArticles] = useState([]);

  useEffect(() => {
    api.recent().then((r) => setArticles(r.articles || []));
  }, []);

  return (
    <div className="oc-recent">
      <h1>Recent changes</h1>
      <p className="oc-subtitle">Last {articles.length} updated articles.</p>
      <ul className="oc-article-list">
        {articles.map((a) => (
          <li key={a.id}>
            <Link to={`/wiki/${encodeURIComponent(a.id)}`}>
              <span className={`oc-ns oc-ns-${a.namespace?.toLowerCase()}`}>
                {a.namespace}
              </span>
              {a.title}
            </Link>
            <span className="oc-recent-time">{formatDate(a.updated)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
