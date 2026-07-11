import http from "http";

// The standalone FRAME Mobile app has been retired. Everyone — phone and
// desktop — now uses the single full web app served at the origin root ("/").
//
// This service owns the "/mobile/" path (see .replit-artifact/artifact.toml)
// and simply redirects every request to "/" so the old mobile link lands on
// the complete app. The same script runs in development (the frame-mobile
// workflow) and in production (the artifact's `serve` script), so one change
// covers both environments.
//
// Notes:
// - Location is origin-relative ("/"), so it resolves correctly behind the
//   shared proxy in both dev (replit.dev) and production (replit.app).
// - 302 (temporary) + no-store avoids browsers permanently caching the
//   redirect, so the routing stays changeable.
const PORT = process.env.PORT || 8099;

const server = http.createServer((_req, res) => {
  res.writeHead(302, {
    Location: "/",
    "Cache-Control": "no-store",
  });
  res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `FRAME mobile retired — redirecting all /mobile requests to / (port ${PORT})`,
  );
});
