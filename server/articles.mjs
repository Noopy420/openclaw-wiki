// Article model + in-memory index.
//
// An Article normalizes any source into:
//   { id, title, summary, content, sections[], categories[],
//     sources[], updated, agent, namespace }
//
// Namespaces mirror Wikipedia ("Main", "Diary:", "Identity:", "Chunk:") so
// the reader can mentally separate curated wiki pages from raw journaling.

import path from "node:path";
import {
  loadWikiPages,
  loadDiaryPages,
  loadIdentityPages,
  listMemoryDBs,
  loadChunksByPath,
} from "./sources.mjs";
import { buildEntityIndex, injectWikiLinks } from "./wikilinks.mjs";
import { isEditable, isDeletable } from "./editor.mjs";

// --- id / slug ------------------------------------------------------------

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\s_/\\]+/g, "-")
    .replace(/[^a-z0-9-.]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function firstHeading(md) {
  const m = md.match(/^#\s+(.+?)$/m);
  return m ? m[1].trim() : null;
}

function firstParagraph(md) {
  // Strip headings + front matter remnants, find first real para.
  const lines = md.split("\n");
  let para = [];
  for (const line of lines) {
    if (/^#/.test(line)) continue;
    if (/^\s*$/.test(line)) {
      if (para.length) break;
      continue;
    }
    para.push(line.trim());
  }
  return para.join(" ").slice(0, 600);
}

function extractSections(md) {
  // Split markdown into sections by H2/H3 headings.
  const sections = [];
  const lines = md.split("\n");
  let current = { heading: null, level: 0, body: [] };
  for (const line of lines) {
    const h = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (h) {
      if (current.heading != null || current.body.length) sections.push(current);
      current = { heading: h[2].trim(), level: h[1].length, body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.heading != null || current.body.length) sections.push(current);
  return sections.map((s) => ({
    heading: s.heading,
    level: s.level,
    anchor: s.heading ? slugify(s.heading) : null,
    markdown: s.body.join("\n").trim(),
  }));
}

function categoriesFor(page) {
  const cats = [];
  if (page.agent) cats.push(`Agent:${page.agent}`);
  cats.push(`Type:${page.sourceType}`);
  // Date derived from filename like 2026-04-22.md.
  const base = path.basename(page.path || "", ".md");
  if (/^\d{4}-\d{2}-\d{2}$/.test(base)) cats.push(`Date:${base.slice(0, 7)}`);
  // Phase folder (light/rem/deep).
  const phaseMatch = (page.path || "").match(/[\\/](light|rem|deep)[\\/]/i);
  if (phaseMatch) cats.push(`Phase:${phaseMatch[1].toLowerCase()}`);
  // Frontmatter-declared tags.
  const tags = page.frontmatter?.tags;
  if (Array.isArray(tags)) for (const t of tags) cats.push(`Tag:${t}`);
  return cats;
}

function namespaceFor(sourceType) {
  return {
    wiki: "Main",
    diary: "Diary",
    identity: "Identity",
    chunk: "Chunk",
  }[sourceType] || "Main";
}

function buildIdFromPage(page) {
  const ns = namespaceFor(page.sourceType).toLowerCase();
  const base = path.basename(page.path, ".md");
  const agent = page.agent || "default";
  return `${ns}.${agent}.${slugify(base)}`;
}

function buildTitleFromPage(page) {
  // Prefer frontmatter, then first heading, then filename.
  if (page.frontmatter?.title) return String(page.frontmatter.title);
  const h1 = firstHeading(page.content);
  if (h1) return h1;
  const base = path.basename(page.path, ".md");
  return base
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- page -> article ------------------------------------------------------

function pageToArticle(page) {
  const id = buildIdFromPage(page);
  const title = buildTitleFromPage(page);
  return {
    id,
    title,
    namespace: namespaceFor(page.sourceType),
    agent: page.agent,
    sourceType: page.sourceType,
    summary: firstParagraph(page.content),
    content: page.content,
    sections: extractSections(page.content),
    categories: categoriesFor(page),
    sources: [
      {
        path: page.path,
        mtime: page.mtime,
      },
    ],
    updated: page.mtime,
  };
}

function chunksToArticle(group) {
  const base = path.basename(group.path, path.extname(group.path));
  const id = `chunk.${group.agent}.${slugify(base)}`;
  const content = group.chunks
    .map((c) => `### Lines ${c.start_line}–${c.end_line}\n\n${c.text}\n`)
    .join("\n---\n\n");
  const title = base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const updated = Math.max(...group.chunks.map((c) => c.updated_at || 0));
  return {
    id,
    title: `${title} (chunks)`,
    namespace: "Chunk",
    agent: group.agent,
    sourceType: "chunk",
    summary: (group.chunks[0]?.text || "").slice(0, 400),
    content,
    sections: extractSections(content),
    categories: [`Agent:${group.agent}`, "Type:chunk", `Source:${group.source}`],
    sources: [{ path: group.path, mtime: updated }],
    updated,
  };
}

// --- catalog / index ------------------------------------------------------

let catalog = {
  articles: [],          // [Article]
  byId: new Map(),       // id -> Article
  entityIndex: null,     // from wikilinks.mjs
  builtAt: 0,
};

export function getCatalog() {
  return catalog;
}

export function getArticle(id) {
  return catalog.byId.get(id) || null;
}

/**
 * Rebuild the full article catalog from all sources.
 * Called at startup and on demand.
 */
export async function buildCatalog() {
  const [wiki, diary, identity, dbs] = await Promise.all([
    loadWikiPages(),
    loadDiaryPages(),
    loadIdentityPages(),
    listMemoryDBs(),
  ]);

  const pageArticles = [...wiki, ...diary, ...identity].map(pageToArticle);

  const chunkArticles = [];
  for (const db of dbs) {
    const groups = await loadChunksByPath(db.agent);
    for (const group of groups) {
      // Skip chunk groups that duplicate a markdown file we already indexed.
      if (pageArticles.some((a) => a.sources[0]?.path === group.path)) continue;
      chunkArticles.push(chunksToArticle(group));
    }
  }

  const all = [...pageArticles, ...chunkArticles];

  // Deduplicate by id (later wins).
  const byId = new Map();
  for (const a of all) byId.set(a.id, a);
  const articles = [...byId.values()];

  // Build entity index for wikilink injection + backlink resolution.
  const entityIndex = buildEntityIndex(articles);

  // Render wikilinks into each article's content.
  for (const a of articles) {
    a.rendered = injectWikiLinks(a.content, entityIndex, a.id);
  }

  // Compute backlinks from rendered content.
  const backlinkMap = new Map(); // targetId -> Set(sourceId)
  for (const a of articles) {
    const linkRe = /\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g;
    let m;
    while ((m = linkRe.exec(a.rendered)) != null) {
      const targetId = m[1].trim();
      if (!backlinkMap.has(targetId)) backlinkMap.set(targetId, new Set());
      backlinkMap.get(targetId).add(a.id);
    }
  }
  for (const a of articles) {
    a.backlinks = [...(backlinkMap.get(a.id) || [])]
      .filter((id) => id !== a.id)
      .map((id) => {
        const src = byId.get(id);
        return src ? { id: src.id, title: src.title, namespace: src.namespace } : null;
      })
      .filter(Boolean);
  }

  // Compute editable/deletable flags after all other fields are in place.
  for (const a of articles) {
    a.editable = isEditable(a);
    a.deletable = isDeletable(a);
  }

  catalog = { articles, byId, entityIndex, builtAt: Date.now() };
  return catalog;
}
