import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 4701,
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:4700",
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
