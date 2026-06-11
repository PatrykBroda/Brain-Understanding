import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const PORT = process.env.PORT || 8099;
const BASE_PATH = (process.env.BASE_PATH || "/mobile/").replace(/\/?$/, "/");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

const server = http.createServer((req, res) => {
  res.setHeader("Cache-Control", "no-cache");

  let rawPath = (req.url || "/").split("?")[0];

  // Strip BASE_PATH prefix so /mobile/_expo/... → /_expo/...
  if (rawPath.startsWith(BASE_PATH)) {
    rawPath = "/" + rawPath.slice(BASE_PATH.length);
  } else if (rawPath === BASE_PATH.slice(0, -1)) {
    rawPath = "/";
  }

  // Normalize to avoid path traversal
  const safePath = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(distDir, safePath);

  const tryFile = (fp) => {
    try {
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        const ext = path.extname(fp).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        fs.createReadStream(fp).pipe(res);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

  if (tryFile(filePath)) return;
  if (tryFile(filePath + ".html")) return;
  if (tryFile(path.join(filePath, "index.html"))) return;

  // SPA fallback: serve index.html
  const indexPath = path.join(distDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(indexPath).pipe(res);
  } else {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("Building bundle, please wait and refresh.");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FRAME mobile serving on port ${PORT} (base: ${BASE_PATH})`);
});
