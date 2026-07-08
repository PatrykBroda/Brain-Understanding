#!/usr/bin/env node
// Minimal path-routing reverse proxy for smoke-test runs.
//
// Mimics the workspace's shared proxy (localhost:80) so Playwright smoke
// suites can keep using relative URLs ("/api/...", "/", "/mobile/...") while
// running against a fully isolated stack on dedicated ports — never touching
// the main workflow's ports.
//
// Routing:
//   /api/*  -> http://127.0.0.1:$API_PORT   (path NOT rewritten)
//   *       -> http://127.0.0.1:$APP_PORT   (path NOT rewritten)
//
// Env:
//   PROXY_PORT  port this proxy listens on           (required)
//   API_PORT    upstream API server port             (required)
//   APP_PORT    upstream app (frontend/static) port  (required)
//
// Streams request and response bodies (SSE-safe — no buffering).
import http from "node:http";

const PROXY_PORT = Number(process.env.PROXY_PORT);
const API_PORT = Number(process.env.API_PORT);
const APP_PORT = Number(process.env.APP_PORT);

if (!PROXY_PORT || !API_PORT || !APP_PORT) {
  console.error("[smoke-proxy] PROXY_PORT, API_PORT and APP_PORT are all required");
  process.exit(1);
}

function targetPort(url) {
  return url === "/api" || url.startsWith("/api/") || url.startsWith("/api?")
    ? API_PORT
    : APP_PORT;
}

const server = http.createServer((req, res) => {
  const port = targetPort(req.url ?? "/");
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.headers);
      upRes.pipe(res);
    }
  );
  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
    }
    res.end(`smoke-proxy upstream error (:${port}): ${err.message}`);
  });
  req.pipe(upstream);
});

server.on("error", (err) => {
  console.error(`[smoke-proxy] server error: ${err.message}`);
  process.exit(1);
});

server.listen(PROXY_PORT, "127.0.0.1", () => {
  console.log(
    `[smoke-proxy] listening on :${PROXY_PORT} — /api -> :${API_PORT}, * -> :${APP_PORT}`
  );
});
