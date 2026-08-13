const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Bundle the offline CosmicOrb page (assets/orb.html) as a static asset so the
// OrbWebView can load the real WebGL orb from local storage with no network.
if (!config.resolver.assetExts.includes("html")) {
  config.resolver.assetExts.push("html");
}

module.exports = config;
