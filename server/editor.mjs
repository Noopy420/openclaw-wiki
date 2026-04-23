// Safe writer for article source files.
//
// Design rules:
//  1. Only markdown files under the configured openclaw home can be written.
//     No path traversal outside that tree.
//  2. Namespace policy determines what's touchable:
//       - "wiki"     : full read/write + create + delete
//       - "identity" : read/write (behind the scenes, these are agent
//                      personality files the user may want to tune)
//       - "diary"    : read-only (journal entries shouldn't be edited)
//       - "chunk"    : read-only (synthesized from SQLite)
//  3. Every save writes a timestamped .bak-<ts> next to the file so nothing
//     is ever lost silently.
//  4. New wiki pages are created under agents/<agent>/memory/wiki/<slug>.md.

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";

// Duplicated from articles.mjs to avoid a circular import. Keep in sync.
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\s_/\\]+/g, "-")
    .replace(/[^a-z0-9-.]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

const EDITABLE_NAMESPACES = new Set(["Main", "Identity"]);
const CREATABLE_NAMESPACES = new Set(["Main"]); // new pages land in wiki/

export function isEditable(article) {
  if (!article) return false;
  if (!EDITABLE_NAMESPACES.has(article.namespace)) return false;
  const p = article.sources?.[0]?.path;
  if (!p) return false;
  return isWithinOpenclawHome(p);
}

export function isDeletable(article) {
  // Only user-created wiki pages can be deleted, to protect identity files
  // and anything synthesized.
  return article?.namespace === "Main" && isEditable(article);
}

function isWithinOpenclawHome(absPath) {
  const normRoot = path.resolve(config.openclawHome) + path.sep;
  const normPath = path.resolve(absPath);
  return normPath.startsWith(normRoot);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function backupFile(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
  } catch {
    return null; // no file yet, nothing to back up
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const bak = `${filePath}.bak-${ts}`;
  await fs.copyFile(filePath, bak);
  return bak;
}

/**
 * Overwrite the markdown source of an existing article.
 */
export async function saveArticle(article, content) {
  if (!isEditable(article)) {
    throw new Error(`article ${article?.id} is not editable (namespace ${article?.namespace})`);
  }
  const target = article.sources[0].path;
  if (!isWithinOpenclawHome(target)) {
    throw new Error("refusing to write outside OpenClaw home");
  }
  const backup = await backupFile(target);
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, content, "utf-8");
  return { path: target, backup };
}

/**
 * Create a new wiki markdown file under the given agent's wiki dir.
 * Returns the absolute path written.
 */
export async function createArticle({ agent, title, content }) {
  if (!agent) throw new Error("agent required");
  if (!title) throw new Error("title required");

  const safeAgent = slugify(agent);
  const wikiDir = path.join(config.agentsDir, safeAgent, "memory", "wiki");
  await ensureDir(wikiDir);

  const base = slugify(title) || `page-${Date.now()}`;
  let filename = `${base}.md`;
  let full = path.join(wikiDir, filename);

  // Avoid clobbering an existing file — append a numeric suffix.
  let attempt = 1;
  while (true) {
    try {
      await fs.access(full);
      attempt += 1;
      filename = `${base}-${attempt}.md`;
      full = path.join(wikiDir, filename);
    } catch {
      break;
    }
  }

  const body = content && content.trim().length
    ? content
    : `# ${title}\n\n_New article. Start writing._\n`;

  await fs.writeFile(full, body, "utf-8");

  return {
    path: full,
    agent: safeAgent,
    filename,
  };
}

/**
 * Delete a wiki markdown file. Doesn't truly unlink — moves to a `.trash/`
 * directory next to the wiki dir so a misclick is recoverable.
 */
export async function deleteArticle(article) {
  if (!isDeletable(article)) {
    throw new Error(`article ${article?.id} is not deletable`);
  }
  const source = article.sources[0].path;
  if (!isWithinOpenclawHome(source)) {
    throw new Error("refusing to delete outside OpenClaw home");
  }

  const agentDir = path.join(config.agentsDir, article.agent);
  const trashDir = path.join(agentDir, "memory", ".trash");
  await ensureDir(trashDir);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(trashDir, `${path.basename(source, ".md")}.${ts}.md`);
  await fs.rename(source, dest);
  return { trashedTo: dest };
}

/** Used when listing agents for the "create new" form. */
export async function listAgentsForCreate() {
  try {
    const entries = await fs.readdir(config.agentsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}
