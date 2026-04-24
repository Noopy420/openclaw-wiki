// Tiny fetch wrapper. Everything is local so no error handling fluff.

const BASE = "/api";

async function get(url) {
  const r = await fetch(BASE + url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function send(method, url, body) {
  const r = await fetch(BASE + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `${r.status} ${r.statusText}`);
  return data;
}

export const api = {
  status: () => get("/status"),
  articles: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get("/articles" + (qs ? "?" + qs : ""));
  },
  article: (id) => get(`/articles/${encodeURIComponent(id)}`),
  raw: (id) =>
    fetch(`${BASE}/articles/${encodeURIComponent(id)}/raw`).then((r) => r.text()),
  backlinks: (id) => get(`/articles/${encodeURIComponent(id)}/backlinks`),
  search: (q) => get(`/search?q=${encodeURIComponent(q)}`),
  categories: () => get("/categories"),
  recent: () => get("/recent"),
  random: () => get("/random"),
  reindex: () => send("POST", "/reindex"),
  agents: () => get("/agents"),
  setup: () => get("/setup"),

  // writes
  save: (id, content) =>
    send("PUT", `/articles/${encodeURIComponent(id)}`, { content }),
  create: ({ agent, title, content }) =>
    send("POST", "/articles", { agent, title, content }),
  remove: (id) => send("DELETE", `/articles/${encodeURIComponent(id)}`),
};
