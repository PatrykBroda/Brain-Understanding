import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

// Public origin for canonical/OG URLs, sitemap and robots. Derived from the
// first entry of REPLIT_DOMAINS. Fail-soft: when absent (e.g. local tooling),
// %SITE_ORIGIN% collapses to "" so URLs degrade to root-relative instead of
// breaking the build.
const SITE_ORIGIN = (() => {
  const first = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  return first ? `https://${first}` : "";
})();

function seoPlugin(): Plugin {
  return {
    name: "frame-seo",
    transformIndexHtml(html) {
      return html.replaceAll("%SITE_ORIGIN%", SITE_ORIGIN);
    },
    generateBundle() {
      // robots.txt — generated (the static public/ copy was removed) so the
      // Sitemap line always points at the real deployed origin.
      const robots = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        ...(SITE_ORIGIN ? ["", `Sitemap: ${SITE_ORIGIN}/sitemap.xml`] : []),
        "",
      ].join("\n");
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });

      if (SITE_ORIGIN) {
        const pages = ["/", "/sign-in", "/sign-up"];
        const sitemap =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          pages.map((p) => `  <url><loc>${SITE_ORIGIN}${p}</loc></url>`).join("\n") +
          `\n</urlset>\n`;
        this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });
      }
    },
  };
}

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    seoPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "favicon.svg",
        "logo.svg",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "FRAME — Combat Performance",
        short_name: "FRAME",
        description:
          "Your combat-performance and nervous-system coach. Train the frame that holds under pressure.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0a0a0a",
        theme_color: "#0a0a0a",
        categories: ["sports", "health", "lifestyle"],
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // Headroom above the 2 MiB Workbox default so bundle growth can't
        // hard-fail the production build at the SW precache step again.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // The coach is served at "/" but the Expo app ("/mobile/") and the API
        // ("/api", "/healthz") share this origin. Keep the SW from hijacking
        // those navigations with the coach's index.html.
        navigateFallbackDenylist: [
          /^\/api(?:\/|$)/,
          /^\/mobile(?:\/|$)/,
          /^\/healthz(?:\/|$)/,
          /^\/robots\.txt$/,
          /^\/sitemap\.xml$/,
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // The three.js stack (CosmicOrb) is the single largest dependency.
          // Splitting it keeps each chunk under Workbox's precache limit.
          if (/node_modules\/(three|@react-three)\//.test(id)) {
            return "three";
          }
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
