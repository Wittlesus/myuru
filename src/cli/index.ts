#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { runCommand } from './commands/run.js';

const program = new Command();

program
  .name('myuru')
  .description('TypeScript-first multi-agent orchestration framework')
  .version('2.0.0-alpha.1');

program
  .command('init')
  .description('Initialize a new MyUru project')
  .option('-d, --dir <path>', 'Target directory', '.')
  .action(initCommand);

program
  .command('run')
  .description('Run an agent or pipeline')
  .requiredOption('-t, --task <task>', 'Task description')
  .option('-c, --config <path>', 'Config file path', 'myuru.config.ts')
  .option('-m, --model <model>', 'Model to use (e.g. claude-sonnet-4-5)')
  .option('-p, --provider <provider>', 'Provider (anthropic, openai, google)', 'anthropic')
  .option('--max-steps <n>', 'Maximum agent steps', '10')
  .option('--budget <usd>', 'Max budget in USD')
  .option('--trace', 'Enable tracing output')
  .option('--dry-run', 'Show what would run without executing')
  .action(runCommand);

program.parse();
