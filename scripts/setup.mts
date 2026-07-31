import {
  backendDir,
  backendIsPresent,
  clientDir,
  readConfig,
} from './config.mjs';
import {
  checkEnv,
  ensureEnvFile,
  reconcileClientUrl,
  reconcilePreviewSecret,
  reportCheck,
} from './env.mjs';
import { main, run } from './run.mjs';

/**
 * One-shot setup:
 *   1. fetch the pinned LaunchPad backend into ./strapi (skipped if present)
 *   2. install client and backend dependencies
 *   3. create both .env files and make sure their shared secrets agree
 *   4. verify the result before claiming success
 *
 * Safe to re-run. Existing .env files are never overwritten — only the shared
 * PREVIEW_SECRET is reconciled, and it says so when it changes anything.
 */
main(async () => {
  const config = readConfig();

  console.log('\n── 1/4  Backend ──');
  if (backendIsPresent()) {
    console.log('  ./strapi already present, skipping fetch');
  } else {
    await run('node', ['--import', 'tsx', './scripts/fetch-backend.mts'], {
      quiet: true,
    });
  }

  console.log('\n── 2/4  Dependencies ──');
  await run('yarn', ['install'], { cwd: clientDir });
  await run('yarn', ['install'], { cwd: backendDir });

  console.log('\n── 3/4  Environment ──');
  ensureEnvFile(clientDir, 'client');
  ensureEnvFile(backendDir, 'strapi');
  reconcilePreviewSecret();
  reconcileClientUrl();

  console.log('\n── 4/4  Verify ──');
  const result = checkEnv();
  reportCheck(result);
  if (!result.ok) {
    throw new Error(
      'Setup finished but the environment is inconsistent (see above).',
    );
  }

  console.log(`
Setup complete.

  Backend  ./strapi   (LaunchPad ${config.commit.slice(0, 8)})
  Client   ./client   (Astro)

Next:
  yarn seed     load the demo content into Strapi (destructive — wipes existing data)
  yarn dev      start Strapi on :1337 and the client on :4321
`);
});
