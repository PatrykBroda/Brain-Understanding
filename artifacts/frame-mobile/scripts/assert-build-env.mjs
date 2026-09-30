#!/usr/bin/env node
/**
 * Fails an EAS *production* build when a required EXPO_PUBLIC_* secret is
 * missing, instead of shipping a bundle that inlines an empty string.
 *
 * eas.json forwards these ("EXPO_PUBLIC_DOMAIN": "$EXPO_PUBLIC_DOMAIN") but
 * does not define them, so an unset EAS secret produces a build that installs
 * fine and then cannot reach the API: the paywall renders with no price, which
 * is the Guideline 3.1.2(c) rejection, and the Privacy / Terms links silently
 * do nothing. That must be caught here, not by App Review.
 *
 * Wired to the `eas-build-pre-install` npm lifecycle hook, which EAS runs on
 * the build worker before installing dependencies. Runs locally too
 * (`node scripts/assert-build-env.mjs --profile production`) for a pre-flight
 * check before burning a build.
 *
 * Only production is gated: development and preview builds are routinely run
 * against a dev domain supplied at runtime.
 */

const REQUIRED_FOR_PRODUCTION = [
  {
    name: "EXPO_PUBLIC_DOMAIN",
    why: "API host. Without it every request goes to a relative path and the paywall shows no price.",
  },
  {
    name: "EXPO_PUBLIC_REVENUECAT_IOS_KEY",
    why: "RevenueCat SDK key. Without it StoreKit products never load and no price can be displayed.",
  },
];

/** A forwarded-but-unset variable arrives as "", "$VAR" or "undefined". */
function isMissing(value) {
  if (value === undefined || value === null) return true;
  const v = String(value).trim();
  return v === "" || v === "undefined" || v === "null" || v.startsWith("$");
}

function resolveProfile(argv, env) {
  const flagIndex = argv.indexOf("--profile");
  if (flagIndex !== -1 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  return env.EAS_BUILD_PROFILE ?? "";
}

const profile = resolveProfile(process.argv.slice(2), process.env);

if (profile !== "production") {
  console.log(
    `assert-build-env: profile "${profile || "(none)"}" is not gated, skipping.`
  );
  process.exit(0);
}

const missing = REQUIRED_FOR_PRODUCTION.filter((v) => isMissing(process.env[v.name]));

if (missing.length === 0) {
  console.log("assert-build-env: all required production secrets are present.");
  process.exit(0);
}

console.error("\nassert-build-env: FAILING the production build.\n");
for (const { name, why } of missing) {
  const raw = process.env[name];
  const shown = raw === undefined ? "(unset)" : JSON.stringify(raw);
  console.error(`  ${name} is missing — resolved to ${shown}`);
  console.error(`    ${why}\n`);
}
console.error(
  "Set these as EAS secrets for the production profile:\n" +
    "  eas secret:create --scope project --name EXPO_PUBLIC_DOMAIN --value <production-domain>\n" +
    "Then rebuild. Shipping without them reproduces the 3.1.2(c) price rejection.\n"
);
process.exit(1);
