import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";

export default function Category() {
  const { name } = useParams();
  const [articles, setArticles] = useState([]);

  useEffect(() => {
    api.articles({ category: name }).then((r) => setArticles(r.articles || []));
  }, [name]);

  return (
    <div className="oc-category">
      <h1>
        Category <em>{name}</em>
      </h1>
      <p className="oc-subtitle">
        {articles.length} article{articles.length === 1 ? "" : "s"}
      </p>
      <ul className="oc-article-list">
        {articles.map((a) => (
          <li key={a.id}>
            <Link to={`/wiki/${encodeURIComponent(a.id)}`}>
              <span className={`oc-ns oc-ns-${a.namespace?.toLowerCase()}`}>
                {a.namespace}
              </span>
              {a.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
