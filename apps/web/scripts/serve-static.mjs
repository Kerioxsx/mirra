#!/usr/bin/env node
// Minimal static server for the exported site (`out/`), used for local previews and e2e tests.
// Mirrors how a CDN serves a Next.js static export with `trailingSlash: true`.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "out");
const port = Number(process.env.PORT ?? 3000);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".glb": "model/gltf-binary",
};

function resolveFile(urlPath) {
  const safe = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, safe);
  if (!file.startsWith(root)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
  return existsSync(file) ? file : null;
}

createServer((req, res) => {
  const path = req.url ?? "/";
  // Next exports routes as folders; redirect /dresser → /dresser/ like a CDN would.
  if (!extname(path.split("?")[0]) && !path.split("?")[0].endsWith("/")) {
    const [p, q] = path.split("?");
    res.writeHead(308, { Location: `${p}/${q ? `?${q}` : ""}` }).end();
    return;
  }
  const file = resolveFile(path);
  const status = file ? 200 : 404;
  const target = file ?? join(root, "404.html");
  res.writeHead(status, {
    "Content-Type": types[extname(target)] ?? "application/octet-stream",
    "Cache-Control": target.includes("/_next/static/")
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(target).pipe(res);
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));
