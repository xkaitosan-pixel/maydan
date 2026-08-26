import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const port = Number(process.env.PORT || 4178);
const basePath = "/release-check/";
const root = path.resolve(import.meta.dirname, "../dist/public");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (!url.pathname.startsWith(basePath)) {
    response.writeHead(404).end("Not found");
    return;
  }

  const relativePath = decodeURIComponent(url.pathname.slice(basePath.length));
  let filePath = path.resolve(root, relativePath || "index.html");
  if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = path.join(root, "index.html");
  }

  const headers = {
    "Content-Type": mimeTypes[path.extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": filePath.endsWith("service-worker.js") ? "no-cache" : "no-store",
  };
  response.writeHead(200, headers);
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1");