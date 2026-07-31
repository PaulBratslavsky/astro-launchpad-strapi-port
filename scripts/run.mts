import { spawn } from 'child_process';
import * as path from 'path';

import { rootDir } from './config.mjs';

/** Runs a command, streaming its output, and rejects on a non-zero exit. */
export function run(
  command: string,
  args: string[],
  options: { cwd?: string; quiet?: boolean } = {},
): Promise<void> {
  const cwd = options.cwd ?? rootDir;

  return new Promise((resolve, reject) => {
    if (!options.quiet) {
      const where = path.relative(rootDir, cwd) || '.';
      console.log(`\n> ${command} ${args.join(' ')}  (in ${where})`);
    }

    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      // Windows resolves `yarn`/`git` through the shell.
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `\`${command} ${args.join(' ')}\` exited with code ${code}`,
          ),
        );
    });
  });
}

/** Fails with a readable message instead of an unhandled rejection. */
export function main(fn: () => Promise<void>): void {
  fn().catch((error: unknown) => {
    console.error(
      `\n✖ ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
