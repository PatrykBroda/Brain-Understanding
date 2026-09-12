import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(appDir, "dist");
const port = Number(process.env.PORT || 8099);
const basePath = "/mobile/";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const contentType =
    mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer((req, res) => {
  const requestPath = new URL(req.url || "/", "http://localhost").pathname;
  let relativePath;
  if (requestPath === "/mobile") {
    relativePath = "/";
  } else if (requestPath.startsWith(basePath)) {
    relativePath = `/${requestPath.slice(basePath.length)}`;
  } else {
    res.writeHead(404).end();
    return;
  }

  const normalized = path.posix.normalize(relativePath);
  const candidate = path.join(distDir, normalized);
  if (
    sendFile(res, candidate) ||
    sendFile(res, `${candidate}.html`) ||
    sendFile(res, path.join(candidate, "index.html"))
  ) {
    return;
  }

  if (!sendFile(res, path.join(distDir, "index.html"))) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Mobile smoke bundle is missing.");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`FRAME mobile smoke server listening on ${port}`);
});