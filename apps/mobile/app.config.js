/**
 * Dynamic layer over app.json. Android push through Expo needs Firebase's
 * google-services.json inside the build: EAS supplies it as the
 * GOOGLE_SERVICES_JSON file environment variable, and a local build can use
 * ./google-services.json (gitignored). Without either, the build still succeeds
 * and Android devices simply cannot register for push.
 */
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : undefined);
  if (!googleServicesFile) return config;
  return { ...config, android: { ...config.android, googleServicesFile } };
};
