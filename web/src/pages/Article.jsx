import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import ArticleBody from "../components/ArticleBody.jsx";
import TableOfContents from "../components/TableOfContents.jsx";

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default function Article() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    api.article(id).then((r) => setData(r.article)).catch((e) => setErr(e.message));
  }, [id]);

  if (err) {
    return (
      <div className="oc-error">
        <h1>Page not found</h1>
        <p>{err}</p>
        <p>
          <Link to="/">← Back to main page</Link>
        </p>
      </div>
    );
  }
  if (!data) return <div className="oc-loading">loading…</div>;

  return (
    <article className="oc-article">
      <header className="oc-article-header">
        <div className="oc-breadcrumbs">
          <span className={`oc-ns oc-ns-${data.namespace?.toLowerCase()}`}>
            {data.namespace}
          </span>
          {data.agent && (
            <span className="oc-breadcrumb">
              Agent: <Link to={`/?agent=${encodeURIComponent(data.agent)}`}>{data.agent}</Link>
            </span>
          )}
        </div>
        <div className="oc-title-row">
          <h1 className="oc-title">{data.title}</h1>
          {data.editable && (
            <Link
              to={`/wiki/${encodeURIComponent(data.id)}/edit`}
              className="oc-btn oc-btn-small"
              title="Edit this article"
            >
              Edit
            </Link>
          )}
        </div>
        <p className="oc-article-meta">
          Updated {formatDate(data.updated)}
          {data.sources?.[0]?.path && (
            <>
              {" · "}
              <code title={data.sources[0].path}>
                {data.sources[0].path.split(/[\\/]/).slice(-2).join("/")}
              </code>
            </>
          )}
        </p>
      </header>

      {data.sections && data.sections.length > 1 && (
        <TableOfContents sections={data.sections} />
      )}

      <ArticleBody markdown={data.rendered || ""} />

      <aside className="oc-article-sidebar">
        {data.backlinks && data.backlinks.length > 0 && (
          <section>
            <h3>What links here</h3>
            <ul>
              {data.backlinks.map((b) => (
                <li key={b.id}>
                  <Link to={`/wiki/${encodeURIComponent(b.id)}`}>{b.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.categories && data.categories.length > 0 && (
          <section>
            <h3>Categories</h3>
            <ul className="oc-category-list">
              {data.categories.map((c) => (
                <li key={c}>
                  <Link to={`/category/${encodeURIComponent(c)}`}>{c}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3>Tools</h3>
          <ul>
            <li>
              <a
                href={`/api/articles/${encodeURIComponent(data.id)}/raw`}
                target="_blank"
                rel="noreferrer"
              >
                View source
              </a>
            </li>
            <li>
              <Link to="/special/random">Random article</Link>
            </li>
          </ul>
        </section>
      </aside>
    </article>
  );
}
