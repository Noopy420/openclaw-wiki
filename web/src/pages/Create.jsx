import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function Create() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [agent, setAgent] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.agents().then((r) => {
      setAgents(r.agents || []);
      if (r.agents?.length) setAgent(r.agents[0]);
    });
  }, []);

  async function handleCreate() {
    if (!agent || !title.trim()) {
      setError("agent and title are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api.create({ agent, title: title.trim(), content });
      if (r.id) {
        navigate(`/wiki/${encodeURIComponent(r.id)}`);
      } else {
        navigate("/");
      }
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="oc-create">
      <header>
        <h1>New article</h1>
        <p className="oc-subtitle">
          Creates a page under <code>agents/&lt;agent&gt;/memory/wiki/</code>.
          The OpenClaw agent will pick it up on its next dreaming cycle.
        </p>
      </header>

      <div className="oc-form">
        <label>
          <span>Agent</span>
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Pizza ordering preferences"
            autoFocus
          />
        </label>

        <label>
          <span>Initial content</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              "# Title\n\nWrite your article in markdown.\n\n[[other-article-id]] wikilinks work too."
            }
            rows={14}
          />
        </label>

        {error && <div className="oc-error-inline">{error}</div>}

        <div className="oc-form-actions">
          <button
            className="oc-btn oc-btn-primary"
            onClick={handleCreate}
            disabled={saving || !title.trim() || !agent}
          >
            {saving ? "Creating…" : "Create"}
          </button>
          <button className="oc-btn" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
