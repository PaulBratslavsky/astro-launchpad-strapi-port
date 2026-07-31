import * as path from 'path';

import { backendDir, backendIsPresent, clientDir } from './config.mjs';
import { checkEnv, readEnvValue, reportCheck } from './env.mjs';
import { main, run } from './run.mjs';

/**
 * Starts Strapi, waits for it, then starts Astro. Stopping one stops the other.
 *
 * The environment is checked first, because the failures it catches (a drifted
 * PREVIEW_SECRET, a placeholder left in place) otherwise surface much later as
 * opaque 401s or a blank preview pane.
 */
main(async () => {
  if (!backendIsPresent()) {
    throw new Error('No ./strapi found. Run `yarn setup` first.');
  }

  const result = checkEnv();
  if (!result.ok) {
    reportCheck(result);
    throw new Error('Refusing to start with an inconsistent environment.');
  }

  // Ports come from the .env files, so this stack can run alongside another
  // LaunchPad instance without editing any scripts.
  const strapiPort =
    readEnvValue(path.join(backendDir, '.env'), 'PORT') ?? '1337';
  const clientPort =
    readEnvValue(path.join(clientDir, '.env'), 'PORT') ?? '4321';

  console.log(
    `\nStarting Strapi on :${strapiPort} and Astro on :${clientPort}\n`,
  );

  await run(
    'yarn',
    [
      'concurrently',
      '--kill-others',
      '--names',
      'strapi,astro',
      '--prefix-colors',
      'magenta,cyan',
      'cd strapi && yarn develop',
      `npx wait-on http://localhost:${strapiPort}/_health && cd client && yarn dev`,
    ],
    { quiet: true },
  );
});
