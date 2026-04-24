// Capture README screenshots with Playwright.
//
// Usage:
//   1. Start the wiki (`npm start` in another terminal)
//   2. node scripts/screenshots.mjs
//
// Outputs to docs/screenshots/*.png

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "docs", "screenshots");

const BASE = process.env.WIKI_BASE || "http://127.0.0.1:4700";

// Pick an article that's known to exist for the article/editor shots.
const ARTICLE_ID = process.env.WIKI_ARTICLE_ID || "identity.main.agents";

const SHOTS = [
  {
    name: "home",
    url: "/",
    fullPage: false,
    description: "Home page with filter bar and article list",
  },
  {
    name: "article",
    url: `/wiki/${encodeURIComponent(ARTICLE_ID)}`,
    fullPage: false,
    description: "Article reading view with TOC and What-links-here panel",
  },
  {
    name: "editor",
    url: `/wiki/${encodeURIComponent(ARTICLE_ID)}/edit`,
    fullPage: false,
    description: "Split-pane markdown editor with live preview",
  },
  {
    name: "setup",
    url: "/setup",
    fullPage: false,
    description: "OpenClaw setup & config dashboard (viewport)",
  },
  {
    name: "search",
    url: "/search?q=memory",
    fullPage: false,
    description: "Search results with snippet highlighting",
  },
];

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Sanity-check the server is actually running so we don't capture
  // five identical "ECONNREFUSED" pages.
  try {
    const r = await fetch(BASE + "/api/status");
    if (!r.ok) throw new Error(`status ${r.status}`);
  } catch (err) {
    console.error(`✗ wiki not reachable at ${BASE}: ${err.message}`);
    console.error("  start it with `npm start` and re-run this script.");
    process.exit(1);
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // crisper screenshots for retina/4K displays
  });
  const page = await ctx.newPage();

  for (const shot of SHOTS) {
    process.stdout.write(`  → ${shot.name}.png … `);
    await page.goto(BASE + shot.url, { waitUntil: "networkidle" });
    // Small extra settling delay for fonts + react-markdown.
    await page.waitForTimeout(400);

    const out = path.join(OUT_DIR, shot.name + ".png");
    await page.screenshot({ path: out, fullPage: shot.fullPage });
    console.log("ok");
  }

  await browser.close();
  console.log(`\nSaved ${SHOTS.length} screenshots to ${path.relative(ROOT, OUT_DIR)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
