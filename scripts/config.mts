import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/** Shared paths and the pinned-backend config, resolved once. */

export const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export const clientDir = path.join(rootDir, 'client');
export const backendDir = path.join(rootDir, 'strapi');

export interface LaunchpadConfig {
  repository: string;
  directory: string;
  commit: string;
  commitDate?: string;
  seedArchive: string;
}

export function readConfig(): LaunchpadConfig {
  const configPath = path.join(rootDir, 'launchpad.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw) as LaunchpadConfig;

  for (const key of [
    'repository',
    'directory',
    'commit',
    'seedArchive',
  ] as const) {
    if (!config[key]) {
      throw new Error(`launchpad.json is missing "${key}"`);
    }
  }

  return config;
}

/** True when the backend has been fetched (and looks like a Strapi project). */
export function backendIsPresent(): boolean {
  return fs.existsSync(path.join(backendDir, 'package.json'));
}

/** Records which commit the working copy of the backend came from. */
export const stampPath = () => path.join(backendDir, '.launchpad-commit');

export function readBackendStamp(): string | null {
  try {
    return fs.readFileSync(stampPath(), 'utf8').trim();
  } catch {
    return null;
  }
}
