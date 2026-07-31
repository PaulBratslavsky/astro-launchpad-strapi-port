import { checkEnv, reportCheck } from './env.mjs';
import { main } from './run.mjs';

/**
 * Standalone environment check. Exits non-zero on any problem so CI can use it.
 * `yarn dev` runs the same check before starting anything.
 */
main(async () => {
  const result = checkEnv();
  reportCheck(result);
  if (!result.ok) {
    throw new Error('Environment check failed.');
  }
});
