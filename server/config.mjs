// Configuration for openclaw-wiki.
// Paths default to the standard OpenClaw install on Windows, but can be
// overridden with env vars so this works for other users too.

import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const DEFAULT_OPENCLAW_HOME = path.join(HOME, ".openclaw");

export const config = {
  // Root of the OpenClaw data dir.
  openclawHome: process.env.OPENCLAW_HOME || DEFAULT_OPENCLAW_HOME,

  // HTTP server port.
  port: Number(process.env.WIKI_PORT || 4700),

  // Bind address. Stay on loopback — this exposes private memory.
  host: process.env.WIKI_HOST || "127.0.0.1",

  // Where to cache synthesized article data.
  cacheDir: process.env.WIKI_CACHE_DIR ||
    path.join(HOME, ".openclaw", ".wiki-cache"),
};

// Derived paths.
config.memoryDir = path.join(config.openclawHome, "memory");
config.agentsDir = path.join(config.openclawHome, "agents");
config.extensionsDir = path.join(config.openclawHome, "extensions");
