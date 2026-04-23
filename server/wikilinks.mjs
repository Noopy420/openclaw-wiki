// Wikilink injection: turn plain mentions of known article titles into
// `[[articleId|surface]]` links at render time.
//
// Strategy:
//   1. Build an index { surface form (lowercased) -> articleId }.
//   2. Walk the article markdown line by line, skipping code blocks and
//      headings.
//   3. For each line, match longest surface forms first and wrap them in
//      wikilink syntax. The React renderer picks these up and routes them.
//
// This is intentionally simple — good enough for Phase 1, easy to tune.

export function buildEntityIndex(articles) {
  /** @type {Map<string, string>}  lowercase surface -> article id */
  const surface = new Map();
  /** @type {Array<{lower: string, length: number}>} sorted for greedy match */
  const sorted = [];

  for (const a of articles) {
    const addSurface = (s) => {
      if (!s || s.length < 3) return;
      const key = s.toLowerCase();
      // First writer wins — namespace priority via article order.
      if (!surface.has(key)) surface.set(key, a.id);
    };
    addSurface(a.title);
    // Also add title without common prefixes.
    if (a.title.includes(":")) addSurface(a.title.split(":").slice(1).join(":").trim());
    // Aliases from frontmatter.
    if (a.aliases && Array.isArray(a.aliases)) {
      for (const al of a.aliases) addSurface(al);
    }
  }

  for (const [lower] of surface) {
    sorted.push({ lower, length: lower.length });
  }
  sorted.sort((a, b) => b.length - a.length);

  return { surface, sorted };
}

function buildRegex(sorted) {
  if (!sorted.length) return null;
  const escaped = sorted.map((s) => s.lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // \b on both sides; case-insensitive.
  return new RegExp("\\b(" + escaped.join("|") + ")\\b", "gi");
}

export function injectWikiLinks(markdown, entityIndex, selfId) {
  if (!markdown || !entityIndex) return markdown || "";
  const { surface, sorted } = entityIndex;
  const regex = buildRegex(sorted);
  if (!regex) return markdown;

  const lines = markdown.split("\n");
  let inFence = false;
  const out = [];

  for (const raw of lines) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      out.push(raw);
      continue;
    }
    if (inFence || /^\s{4,}/.test(raw) || /^#/.test(raw)) {
      out.push(raw);
      continue;
    }

    // Protect existing inline code and links from rewriting.
    const tokens = [];
    let temp = raw.replace(/(`[^`]+`|\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\])/g, (m) => {
      tokens.push(m);
      return `\u0000${tokens.length - 1}\u0000`;
    });

    temp = temp.replace(regex, (match, _g, offset, full) => {
      const id = surface.get(match.toLowerCase());
      if (!id || id === selfId) return match;
      return `[[${id}|${match}]]`;
    });

    temp = temp.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]);
    out.push(temp);
  }

  return out.join("\n");
}
