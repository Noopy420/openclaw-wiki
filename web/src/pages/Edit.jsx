import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import ArticleBody from "../components/ArticleBody.jsx";

export default function Edit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [article, setArticle] = useState(null);
  const [content, setContent] = useState("");
  const [initialContent, setInitialContent] = useState("");
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .article(id)
      .then((r) => {
        setArticle(r.article);
        setContent(r.article.content || "");
        setInitialContent(r.article.content || "");
      })
      .catch((e) => setError(e.message));
  }, [id]);

  // Warn on tab close with unsaved changes.
  useEffect(() => {
    const dirty = content !== initialContent;
    if (!dirty) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [content, initialContent]);

  async function handleSave() {
    if (!article) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await api.save(article.id, content);
      setInitialContent(content);
      setStatus("Saved.");
      setTimeout(() => setStatus(null), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!article?.deletable) return;
    if (!confirm(`Move "${article.title}" to trash? You can recover it from memory/.trash/.`)) {
      return;
    }
    try {
      await api.remove(article.id);
      navigate("/");
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <div className="oc-error">error: {error}</div>;
  if (!article) return <div className="oc-loading">loading…</div>;

  if (!article.editable) {
    return (
      <div className="oc-error">
        <h1>Read-only</h1>
        <p>
          Articles in the <strong>{article.namespace}</strong> namespace aren't
          editable — they're either journaling (Diary) or synthesized from
          SQLite (Chunk).
        </p>
        <p>
          <Link to={`/wiki/${encodeURIComponent(article.id)}`}>← Back to article</Link>
        </p>
      </div>
    );
  }

  const dirty = content !== initialContent;

  return (
    <div className="oc-editor">
      <header className="oc-editor-header">
        <h1>
          Editing: <em>{article.title}</em>
        </h1>
        <p className="oc-subtitle">
          <span className={`oc-ns oc-ns-${article.namespace.toLowerCase()}`}>
            {article.namespace}
          </span>
          Agent: {article.agent}
          {article.sources?.[0]?.path && (
            <>
              {" · "}
              <code>
                {article.sources[0].path.split(/[\\/]/).slice(-3).join("/")}
              </code>
            </>
          )}
        </p>
      </header>

      <div className="oc-editor-toolbar">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="oc-btn oc-btn-primary"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => {
            if (dirty && !confirm("Discard unsaved changes?")) return;
            navigate(`/wiki/${encodeURIComponent(article.id)}`);
          }}
          className="oc-btn"
        >
          {dirty ? "Cancel" : "Back"}
        </button>
        {article.deletable && (
          <button
            onClick={handleDelete}
            className="oc-btn oc-btn-danger"
          >
            Delete
          </button>
        )}
        {status && <span className="oc-save-status">{status}</span>}
        {dirty && !status && <span className="oc-save-status oc-dirty">Unsaved changes</span>}
      </div>

      <div className="oc-editor-panes">
        <section className="oc-editor-pane">
          <h3>Markdown</h3>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="oc-editor-textarea"
          />
        </section>
        <section className="oc-editor-pane">
          <h3>Preview</h3>
          <div className="oc-editor-preview">
            <ArticleBody markdown={content} />
          </div>
        </section>
      </div>
    </div>
  );
}
