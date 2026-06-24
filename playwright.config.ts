import { defineConfig, devices } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";

// Resolve a Chromium that actually launches in this Replit/Nix container.
//
// The Playwright-bundled `chrome-headless-shell` crashes immediately on launch
// here ("Target page, context or browser has been closed") because it is
// missing system shared libraries. The only supported way to install those is
// `playwright install --with-deps`, which needs root/apt and is forbidden in
// Replit. The Nix-provided system Chromium ships with all its libraries wired
// up, so we point Playwright at it instead.
//
// Resolution order:
//   1. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH / CHROMIUM_PATH env override
//   2. auto-discover the newest /nix/store/*-chromium-*/bin/chromium
//      (self-healing across Nix store-hash changes)
//   3. fall back to Playwright's bundled browser (last resort)
function resolveChromium(): string | undefined {
  const envPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROMIUM_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  try {
    const store = "/nix/store";
    const dirs = readdirSync(store)
      .filter((d) => /-chromium-/.test(d))
      .sort()
      .reverse();
    for (const d of dirs) {
      const candidate = `${store}/${d}/bin/chromium`;
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // /nix/store not readable — fall through to the bundled browser.
  }
  return undefined;
}

const executablePath = resolveChromium();

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "/tmp/playwright-report" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:80",
    viewport: { width: 400, height: 720 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    },
  ],
});
