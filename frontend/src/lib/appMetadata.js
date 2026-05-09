import appPackage from '../../../package.json';

const APP_NAME = 'NYX';

function cleanValue(value) {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

export const appMetadata = {
  name: APP_NAME,
  version: cleanValue(process.env.NEXT_PUBLIC_APP_VERSION) || appPackage.version,
  environment: cleanValue(process.env.NEXT_PUBLIC_APP_ENV),
  gitHash: cleanValue(process.env.NEXT_PUBLIC_GIT_HASH),
  buildTimestamp: cleanValue(process.env.NEXT_PUBLIC_BUILD_TIMESTAMP)
};

export function formatAppVersion({ includeEnvironment = true, includeHash = true } = {}) {
  const parts = [`${appMetadata.name} v${appMetadata.version}`];

  if (includeEnvironment && appMetadata.environment) {
    parts.push(appMetadata.environment);
  }

  if (includeHash && appMetadata.gitHash) {
    parts.push(appMetadata.gitHash);
  }

  return parts.join(' • ');
}
