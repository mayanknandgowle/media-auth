#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { executeCommand } from './command.js';

export async function main(args: readonly string[]): Promise<void> {
  const result = await executeCommand(args);
  const destination = result.exitCode === 0 ? process.stdout : process.stderr;
  destination.write(`${JSON.stringify(result.output, null, 2)}\n`);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
