# Design notes

## Why a separate app instead of an OpenClaw extension?

OpenClaw's control UI already has memory-status panes, but they're built for
*operational* inspection — health checks, ingestion counts, dream-diary raw
output. OpenClaw Wiki is a reader's tool: it assumes you want to browse and
curate your agents' knowledge the way you'd browse a book.

Building it as a separate process means:

- It can evolve on its own cadence without being coupled to OpenClaw releases.
- It can speak its own API surface optimized for article-shaped data.
- It stays useful even when the gateway is down (it reads files directly).

## The article model

The core abstraction is a single normalized shape that every source type
collapses into:

```ts
type Article = {
  id: string;            // namespaced slug, e.g. "main.gordon.pizza-rules"
  title: string;
  namespace: "Main" | "Diary" | "Identity" | "Chunk";
  agent: string;
  summary: string;       // first paragraph
  content: string;       // raw markdown
  rendered: string;      // markdown with [[wikilinks]] injected
  sections: Section[];   // split by H2/H3 for TOC
  categories: string[];  // "Agent:x", "Type:y", "Date:2026-04", etc.
  sources: [{path, mtime}];
  backlinks: [{id, title, namespace}];
  updated: number;
  editable: boolean;
  deletable: boolean;
};
```

By forcing everything into this shape, the reader doesn't have to know or
care whether a page came from a handwritten markdown file, a memory-wiki
synthesis, or raw SQLite chunks. The UI reads one model.

## Wikilinks

Unlike Wikipedia, OpenClaw doesn't have editorial wikilinks baked into the
source text. We synthesize them in two passes:

1. **Build** an entity index: `lowercase title → article id`, sorted by
   length descending so longer matches win.
2. **Inject** `[[id|surface]]` into each article's rendered content,
   skipping code blocks, headings, and existing links.

The renderer then converts `[[id|surface]]` into React Router `<Link>`s.
Backlinks are computed by scanning every article's rendered content for
wikilinks targeting it.

## Edit safety

Users edit memory through this app. That memory is precious — it's the
accumulated state of their AI agents. So every write goes through a
policy gate:

1. **Namespace check**: only Main and Identity are editable. Diary and
   Chunk are read-only because they're regenerated automatically.
2. **Path check**: the target must resolve inside `OPENCLAW_HOME`. No path
   traversal, no writing into system dirs.
3. **Backup**: every save copies the existing file to `<file>.bak-<ts>`
   before overwriting.
4. **Soft delete**: `DELETE` moves the file to `memory/.trash/`, never
   `unlink`s.

The worst case from a bad save is an unwanted new file in `.bak-*`; nothing
is lost.

## What we don't do (yet)

- **Conflict resolution**: if OpenClaw's dreaming pipeline rewrites a wiki
  page while the user has an edit open, the user's save will win on their
  next Save. No three-way merge. This is a pragmatic compromise — in
  practice the user is the only writer while the editor is open.
- **Version history UI**: the `.bak-*` files give us history on disk, but
  there's no UI to browse and restore them yet.
- **Embedding-aware search**: FTS5 is available today; sqlite-vec semantic
  search is on the roadmap.
- **Graph view**: the data model supports it (backlinks + categories), but
  the UI just shows lists for now.
