// Server entrypoint. Fastify on 127.0.0.1 only — memory is private.

import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import chokidar from "chokidar";

import { config } from "./config.mjs";
import { buildCatalog } from "./articles.mjs";
import { registerRoutes } from "./routes.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

async function main() {
  const app = Fastify({ logger: { level: "info" } });

  await app.register(cors, { origin: true });

  // Serve static frontend build if present.
  const distDir = path.resolve(__dirname, "..", "web", "dist");
  const indexPath = path.join(distDir, "index.html");
  const hasFrontend = fs.existsSync(indexPath);
  if (hasFrontend) {
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: "/",
      wildcard: false,
    });
    // SPA fallback: any non-API 404 returns index.html.
    const indexHtml = fs.readFileSync(indexPath, "utf-8");
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        reply.code(404).send({ error: "not found" });
        return;
      }
      reply.type("text/html").send(indexHtml);
    });
  } else {
    app.log.warn("frontend build not present — run `npm run build` or use dev mode");
  }

  registerRoutes(app);

  app.log.info("building article catalog…");
  const t0 = Date.now();
  const cat = await buildCatalog();
  app.log.info(
    `catalog ready: ${cat.articles.length} articles in ${Date.now() - t0}ms`
  );

  // Rebuild on markdown changes.
  const watcher = chokidar.watch(
    [path.join(config.agentsDir, "**/*.md"), path.join(config.memoryDir, "*.sqlite")],
    { ignoreInitial: true, persistent: true }
  );
  let rebuildPending = false;
  const scheduleRebuild = () => {
    if (rebuildPending) return;
    rebuildPending = true;
    setTimeout(async () => {
      rebuildPending = false;
      try {
        const t = Date.now();
        const cat = await buildCatalog();
        app.log.info(
          `rebuilt catalog: ${cat.articles.length} articles in ${Date.now() - t}ms`
        );
      } catch (err) {
        app.log.error({ err }, "rebuild failed");
      }
    }, 500);
  };
  watcher.on("add", scheduleRebuild);
  watcher.on("change", scheduleRebuild);
  watcher.on("unlink", scheduleRebuild);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`openclaw-wiki ready at http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
