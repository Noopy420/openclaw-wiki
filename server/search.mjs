// Search across the article catalog.
//
// Two modes:
//   keyword  -> FTS5 against chunks SQLite tables + simple substring over
//               non-chunk articles. Results unified into a single ranked list.
//   catalog  -> pure in-memory title/content match (always available).
//
// Semantic search is deferred to Phase 2 — the sqlite-vec extension isn't
// bundled with better-sqlite3 by default.

import { searchChunks, listMemoryDBs } from "./sources.mjs";
import { getCatalog } from "./articles.mjs";

function scoreCatalogHit(article, q) {
  const ql = q.toLowerCase();
  const title = article.title.toLowerCase();
  const content = article.content.toLowerCase();
  let score = 0;
  if (title === ql) score += 100;
  else if (title.startsWith(ql)) score += 40;
  else if (title.includes(ql)) score += 20;
  const bodyHits = (content.match(new RegExp(escapeRe(ql), "g")) || []).length;
  score += Math.min(30, bodyHits * 3);
  return score;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeSnippet(content, q, maxLen = 240) {
  const ql = q.toLowerCase();
  const lower = content.toLowerCase();
  const i = lower.indexOf(ql);
  if (i < 0) return content.slice(0, maxLen).trim();
  const start = Math.max(0, i - 60);
  const end = Math.min(content.length, i + ql.length + 160);
  const slice = content.slice(start, end).replace(/\s+/g, " ").trim();
  const highlighted = slice.replace(
    new RegExp(escapeRe(q), "gi"),
    (m) => `<mark>${m}</mark>`
  );
  return (start > 0 ? "…" : "") + highlighted + (end < content.length ? "…" : "");
}

export async function search(query, { limit = 30 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];

  const cat = getCatalog();
  const catHits = [];
  for (const a of cat.articles) {
    const score = scoreCatalogHit(a, q);
    if (score > 0) {
      catHits.push({
        articleId: a.id,
        title: a.title,
        namespace: a.namespace,
        agent: a.agent,
        snippet: makeSnippet(a.content, q),
        score,
        source: "catalog",
      });
    }
  }

  // Augment with FTS5 chunk hits (deduped by article).
  const ftsHits = [];
  try {
    const dbs = await listMemoryDBs();
    for (const db of dbs) {
      const rows = searchChunks(db.agent, q, { limit: 20 });
      for (const row of rows) {
        ftsHits.push({
          articleId: null,
          title: `${db.agent} · ${row.path}`,
          namespace: "Chunk",
          agent: db.agent,
          snippet: row.snippet,
          score: 10,
          source: "fts",
          raw: row,
        });
      }
    }
  } catch (err) {
    // FTS table may not exist — no problem.
  }

  const all = [...catHits, ...ftsHits].sort((a, b) => b.score - a.score);
  return all.slice(0, limit);
}
