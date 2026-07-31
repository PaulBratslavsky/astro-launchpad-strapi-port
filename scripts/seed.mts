import * as fs from 'fs';
import * as path from 'path';

import { backendDir, backendIsPresent, readConfig } from './config.mjs';
import { main, run } from './run.mjs';

/**
 * Imports LaunchPad's demo content into the backend's SQLite database.
 *
 * Destructive: `strapi import` wipes existing data before importing, which is
 * exactly what you want to reset to the demo baseline, and exactly what you
 * don't want to run by accident on content you authored. Re-runnable.
 */
main(async () => {
  if (!backendIsPresent()) {
    throw new Error('No ./strapi found. Run `yarn setup` first.');
  }

  const config = readConfig();
  const archive = path.join(backendDir, config.seedArchive);

  if (!fs.existsSync(archive)) {
    throw new Error(
      `Seed archive not found at ${archive}. Check "seedArchive" in launchpad.json.`,
    );
  }

  console.log(
    '\nImporting LaunchPad demo content. This wipes any existing Strapi data.\n',
  );

  await run('yarn', ['strapi', 'import', '-f', config.seedArchive, '--force'], {
    cwd: backendDir,
  });

  console.log(`
Seed complete.

Strapi has no admin user yet — the first \`yarn dev\` will prompt you to create
one at http://localhost:1337/admin.
`);
});
