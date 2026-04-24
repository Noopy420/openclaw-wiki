// HTTP routes. Kept small and JSON-first so the React client can hydrate
// everything over fetch.

import { getCatalog, getArticle, buildCatalog } from "./articles.mjs";
import { search } from "./search.mjs";
import {
  saveArticle,
  createArticle,
  deleteArticle,
  listAgentsForCreate,
} from "./editor.mjs";
import { buildSetupReport } from "./setup.mjs";

export function registerRoutes(app) {
  app.get("/api/status", async () => {
    const cat = getCatalog();
    return {
      ok: true,
      articles: cat.articles.length,
      agents: [...new Set(cat.articles.map((a) => a.agent))],
      namespaces: countBy(cat.articles, "namespace"),
      builtAt: cat.builtAt,
    };
  });

  app.get("/api/articles", async (req) => {
    const { namespace, agent, category } = req.query || {};
    const cat = getCatalog();
    let list = cat.articles;
    if (namespace) list = list.filter((a) => a.namespace === namespace);
    if (agent) list = list.filter((a) => a.agent === agent);
    if (category) list = list.filter((a) => a.categories.includes(category));
    return {
      articles: list.map(summarize).sort((a, b) => a.title.localeCompare(b.title)),
    };
  });

  app.get("/api/articles/:id", async (req, reply) => {
    const a = getArticle(req.params.id);
    if (!a) {
      reply.code(404);
      return { error: "not found", id: req.params.id };
    }
    return { article: fullView(a) };
  });

  app.get("/api/articles/:id/backlinks", async (req, reply) => {
    const a = getArticle(req.params.id);
    if (!a) {
      reply.code(404);
      return { error: "not found" };
    }
    return { backlinks: a.backlinks || [] };
  });

  app.get("/api/articles/:id/raw", async (req, reply) => {
    const a = getArticle(req.params.id);
    if (!a) {
      reply.code(404);
      return { error: "not found" };
    }
    reply.type("text/markdown; charset=utf-8");
    return a.content;
  });

  app.get("/api/search", async (req) => {
    const q = req.query?.q || "";
    const results = await search(q, { limit: 40 });
    return { query: q, results };
  });

  app.get("/api/categories", async () => {
    const cat = getCatalog();
    const counts = new Map();
    for (const a of cat.articles) {
      for (const c of a.categories) counts.set(c, (counts.get(c) || 0) + 1);
    }
    return {
      categories: [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
  });

  app.get("/api/recent", async () => {
    const cat = getCatalog();
    return {
      articles: cat.articles
        .slice()
        .sort((a, b) => (b.updated || 0) - (a.updated || 0))
        .slice(0, 30)
        .map(summarize),
    };
  });

  app.get("/api/random", async (req, reply) => {
    const cat = getCatalog();
    if (!cat.articles.length) {
      reply.code(404);
      return { error: "no articles" };
    }
    const a = cat.articles[Math.floor(Math.random() * cat.articles.length)];
    return { id: a.id };
  });

  app.post("/api/reindex", async () => {
    await buildCatalog();
    return { ok: true, ...(await summaryStats()) };
  });

  // ---- Write endpoints --------------------------------------------------

  app.put("/api/articles/:id", async (req, reply) => {
    const a = getArticle(req.params.id);
    if (!a) {
      reply.code(404);
      return { error: "not found" };
    }
    const content = req.body?.content;
    if (typeof content !== "string") {
      reply.code(400);
      return { error: "content (string) required" };
    }
    try {
      const res = await saveArticle(a, content);
      await buildCatalog();
      return { ok: true, id: a.id, ...res };
    } catch (err) {
      reply.code(403);
      return { error: err.message };
    }
  });

  app.post("/api/articles", async (req, reply) => {
    const { agent, title, content } = req.body || {};
    if (!agent || !title) {
      reply.code(400);
      return { error: "agent and title are required" };
    }
    try {
      const created = await createArticle({ agent, title, content });
      await buildCatalog();
      // Find the resulting article id.
      const cat = getCatalog();
      const match = cat.articles.find(
        (x) => x.sources?.[0]?.path === created.path
      );
      return {
        ok: true,
        ...created,
        id: match?.id || null,
      };
    } catch (err) {
      reply.code(400);
      return { error: err.message };
    }
  });

  app.delete("/api/articles/:id", async (req, reply) => {
    const a = getArticle(req.params.id);
    if (!a) {
      reply.code(404);
      return { error: "not found" };
    }
    try {
      const res = await deleteArticle(a);
      await buildCatalog();
      return { ok: true, ...res };
    } catch (err) {
      reply.code(403);
      return { error: err.message };
    }
  });

  app.get("/api/agents", async () => {
    return { agents: await listAgentsForCreate() };
  });

  app.get("/api/setup", async () => {
    return await buildSetupReport();
  });
}

// ---- helpers -------------------------------------------------------------

function summarize(a) {
  return {
    id: a.id,
    title: a.title,
    namespace: a.namespace,
    agent: a.agent,
    summary: a.summary,
    updated: a.updated,
    categories: a.categories,
    editable: !!a.editable,
    deletable: !!a.deletable,
  };
}

function fullView(a) {
  return {
    id: a.id,
    title: a.title,
    namespace: a.namespace,
    agent: a.agent,
    summary: a.summary,
    content: a.content,       // raw markdown for the editor
    rendered: a.rendered,
    sections: a.sections,
    categories: a.categories,
    sources: a.sources,
    backlinks: a.backlinks || [],
    updated: a.updated,
    editable: !!a.editable,
    deletable: !!a.deletable,
  };
}

function countBy(arr, key) {
  const out = {};
  for (const item of arr) out[item[key]] = (out[item[key]] || 0) + 1;
  return out;
}

async function summaryStats() {
  const cat = getCatalog();
  return { articles: cat.articles.length };
}
