import * as fs from 'fs';
import * as path from 'path';

import {
  backendDir,
  backendIsPresent,
  readBackendStamp,
  readConfig,
  rootDir,
  stampPath,
} from './config.mjs';
import { main, run } from './run.mjs';

/**
 * Provisions the Strapi backend into ./strapi by sparse-checking-out only the
 * `strapi/` directory of the LaunchPad repo at the commit pinned in
 * launchpad.json, then deleting the clone's .git.
 *
 * The result is plain files, not a submodule and not a nested repo — ./strapi
 * is gitignored and has the same status as node_modules: a build artifact you
 * can delete and re-create at will.
 *
 * Sparse checkout keeps the download to the backend alone (~30MB, most of it
 * the seed archive) instead of the whole LaunchPad repo including its Next.js
 * frontend.
 *
 * Usage:
 *   yarn setup:backend           # no-op if ./strapi already exists
 *   yarn setup:backend --force   # delete and re-fetch at the pinned commit
 */

const force = process.argv.slice(2).includes('--force');

main(async () => {
  const config = readConfig();
  const shortSha = config.commit.slice(0, 8);

  if (backendIsPresent() && !force) {
    const stamp = readBackendStamp();
    console.log(
      `Backend already present at ./strapi (commit ${stamp ?? 'unknown'}).`,
    );
    if (stamp && stamp !== config.commit) {
      console.log(
        `Note: launchpad.json now pins ${shortSha}. Run \`yarn setup:backend --force\` to update.`,
      );
    }
    console.log('Nothing to do. Use --force to re-fetch.');
    return;
  }

  if (backendIsPresent() && force) {
    console.log('Removing the existing ./strapi before re-fetching...');
    fs.rmSync(backendDir, { recursive: true, force: true });
  }

  const tempDir = path.join(rootDir, '.launchpad-fetch');
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log(
    `\nFetching the LaunchPad backend (${config.directory}/ at ${shortSha}) from ${config.repository}`,
  );

  try {
    // --filter=blob:none + --sparse means git only downloads blobs for the
    // paths we actually check out, so the Next.js frontend never transfers.
    await run('git', [
      'clone',
      '--no-checkout',
      '--filter=blob:none',
      '--sparse',
      config.repository,
      tempDir,
    ]);

    await run('git', ['sparse-checkout', 'set', config.directory], {
      cwd: tempDir,
    });

    // Pinned commit, so everyone provisions an identical backend.
    await run('git', ['checkout', config.commit], { cwd: tempDir });

    const fetched = path.join(tempDir, config.directory);
    if (!fs.existsSync(fetched)) {
      throw new Error(
        `"${config.directory}/" not found in ${config.repository} at ${shortSha}. Check launchpad.json.`,
      );
    }

    fs.renameSync(fetched, backendDir);

    // Record the provenance, then drop the clone entirely — including its .git,
    // so nothing nested or repo-like is left behind inside this project.
    fs.writeFileSync(stampPath(), `${config.commit}\n`, 'utf8');

    const seed = path.join(backendDir, config.seedArchive);
    if (!fs.existsSync(seed)) {
      console.warn(
        `\n⚠ Seed archive "${config.seedArchive}" not found in the fetched backend. \`yarn seed\` will fail until launchpad.json is corrected.`,
      );
    }

    console.log(`\n✓ Backend ready at ./strapi (LaunchPad ${shortSha}).`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
