// Sources: collect raw memory material from disk and SQLite.
//
// Three source types today:
//  - "wiki"   : agents/<id>/memory/wiki/*.md       (memory-wiki plugin output)
//  - "diary"  : agents/<id>/memory/*.md            (dream diary daily markdown)
//  - "identity": agents/<id>/*.md                   (IDENTITY, SOUL, USER, etc.)
//  - "chunk"  : rows from memory/*.sqlite chunks   (embedded fragments)
//
// Each source maps onto the Article model via articles.mjs.

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { config } from "./config.mjs";

let Database = null;
try {
  // better-sqlite3 is optional — app still works without it, just no chunk source.
  const mod = await import("better-sqlite3");
  Database = mod.default;
} catch (err) {
  console.warn("[sources] better-sqlite3 unavailable, SQLite sources disabled:", err.message);
}

// ---------------------------------------------------------------------------
// Markdown file discovery
// ---------------------------------------------------------------------------

/** List agent ids by scanning the agents/ directory. Skips dot-dirs. */
export async function listAgents() {
  try {
    const entries = await fs.readdir(config.agentsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** List markdown files under a directory (non-recursive or 1 level deep). */
async function listMarkdown(dir, { depth = 1 } = {}) {
  const out = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".md")) {
        out.push(full);
      } else if (entry.isDirectory() && depth > 0) {
        const nested = await listMarkdown(full, { depth: depth - 1 });
        out.push(...nested);
      }
    }
  } catch {
    // Dir missing — that's fine.
  }
  return out;
}

async function readMarkdownFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = matter(raw);
    const stat = await fs.stat(filePath);
    return {
      path: filePath,
      content: parsed.content,
      frontmatter: parsed.data,
      mtime: stat.mtimeMs,
      size: stat.size,
    };
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source: agent wiki pages (memory-wiki plugin output)
// ---------------------------------------------------------------------------

export async function loadWikiPages() {
  const pages = [];
  const agents = await listAgents();
  for (const agent of agents) {
    const wikiDir = path.join(config.agentsDir, agent, "memory", "wiki");
    const files = await listMarkdown(wikiDir, { depth: 2 });
    for (const f of files) {
      const md = await readMarkdownFile(f);
      if (!md) continue;
      pages.push({
        sourceType: "wiki",
        agent,
        ...md,
      });
    }
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Source: dream diary (daily markdown + phase files)
// ---------------------------------------------------------------------------

export async function loadDiaryPages() {
  const pages = [];
  const agents = await listAgents();
  for (const agent of agents) {
    const dir = path.join(config.agentsDir, agent, "memory");
    const files = await listMarkdown(dir, { depth: 2 });
    for (const f of files) {
      // Skip wiki/ — handled separately.
      if (f.includes(path.sep + "wiki" + path.sep)) continue;
      const md = await readMarkdownFile(f);
      if (!md) continue;
      pages.push({
        sourceType: "diary",
        agent,
        ...md,
      });
    }
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Source: agent identity pages (IDENTITY, SOUL, USER, etc.)
// ---------------------------------------------------------------------------

export async function loadIdentityPages() {
  const pages = [];
  const agents = await listAgents();
  const IDENTITY_NAMES = [
    "IDENTITY.md", "SOUL.md", "USER.md", "AGENTS.md",
    "BOOTSTRAP.md", "HEARTBEAT.md", "TOOLS.md", "MEMORY.md",
  ];
  for (const agent of agents) {
    const agentRoot = path.join(config.agentsDir, agent);
    // Check both root and agent/ subdir.
    for (const base of [agentRoot, path.join(agentRoot, "agent")]) {
      for (const name of IDENTITY_NAMES) {
        const full = path.join(base, name);
        const md = await readMarkdownFile(full);
        if (md) {
          pages.push({ sourceType: "identity", agent, ...md });
        }
      }
    }
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Source: SQLite chunks (read-only)
// ---------------------------------------------------------------------------

/**
 * Open an agent's memory DB read-only. Returns null if sqlite is unavailable
 * or the file doesn't exist.
 */
export function openMemoryDB(agentId) {
  if (!Database) return null;
  const file = path.join(config.memoryDir, `${agentId}.sqlite`);
  try {
    return new Database(file, { readonly: true, fileMustExist: true });
  } catch (err) {
    return null;
  }
}

/** List available SQLite memory files as {agent, path}. */
export async function listMemoryDBs() {
  try {
    const entries = await fs.readdir(config.memoryDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".sqlite"))
      .map((e) => ({
        agent: e.name.replace(/\.sqlite$/, ""),
        path: path.join(config.memoryDir, e.name),
      }));
  } catch {
    return [];
  }
}

/**
 * Load chunks from an agent's DB, grouped by source file path.
 * Returns [{agent, path, chunks: [{id, start_line, end_line, text, updated_at}]}].
 */
export async function loadChunksByPath(agentId) {
  const db = openMemoryDB(agentId);
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        "SELECT id, path, source, start_line, end_line, text, updated_at FROM chunks ORDER BY path, start_line"
      )
      .all();
    const byPath = new Map();
    for (const row of rows) {
      if (!byPath.has(row.path)) {
        byPath.set(row.path, {
          agent: agentId,
          path: row.path,
          source: row.source,
          chunks: [],
        });
      }
      byPath.get(row.path).chunks.push(row);
    }
    return [...byPath.values()];
  } catch (err) {
    console.warn(`[sources] chunk read failed for ${agentId}:`, err.message);
    return [];
  } finally {
    db.close();
  }
}

/**
 * Run an FTS5 keyword search across an agent's chunks.
 * Returns [{id, path, snippet, rank}].
 */
export function searchChunks(agentId, query, { limit = 50 } = {}) {
  const db = openMemoryDB(agentId);
  if (!db) return [];
  try {
    // Look for any FTS5 virtual table named like *_fts.
    const ftsTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%fts5%' LIMIT 1"
      )
      .get();
    if (!ftsTable) return [];
    const stmt = db.prepare(
      `SELECT id, path, snippet(${ftsTable.name}, 0, '<mark>', '</mark>', '…', 10) AS snippet, rank
       FROM ${ftsTable.name}
       WHERE ${ftsTable.name} MATCH ?
       ORDER BY rank
       LIMIT ?`
    );
    return stmt.all(query, limit);
  } catch (err) {
    console.warn(`[sources] FTS search failed for ${agentId}:`, err.message);
    return [];
  } finally {
    db.close();
  }
}
