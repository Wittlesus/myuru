#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const pkg = require('../package.json');

const program = new Command();

program
  .name('myuru')
  .description('Multi-provider AI agent orchestrator')
  .version(pkg.version);

program
  .command('init')
  .description('Initialize a MyUru project in the current directory')
  .option('--template <name>', 'Config pack template to use', 'default')
  .action(async (opts) => {
    const { init } = require('../src/commands/init');
    await init(opts);
  });

program
  .command('run')
  .description('Run the orchestrator on the current project')
  .option('-t, --task <description>', 'Single task to execute')
  .option('-f, --file <path>', 'Task file (myuru.config.mjs or JSON)')
  .option('--provider <name>', 'Single provider: claude, openai, gemini', 'claude')
  .option('--model <name>', 'Model override')
  .option('--agents <n>', 'Number of builder agents', '2')
  .option('--concurrent', 'Run agents concurrently instead of sequentially')
  .option('--budget <usd>', 'Max budget in USD')
  .option('--dry-run', 'Show what would run without executing')
  .action(async (opts) => {
    const { run } = require('../src/commands/run');
    await run(opts);
  });

program
  .command('status')
  .description('Show task progress and agent status')
  .action(async () => {
    const { status } = require('../src/commands/status');
    await status();
  });

program
  .command('council')
  .description('Start a council session — agents deliberate, then execute')
  .option('--topic <text>', 'Topic for council discussion')
  .option('--agents <names>', 'Comma-separated agent roles', 'Architect,Reviewer,Tester')
  .option('--rounds <n>', 'Max deliberation rounds', '3')
  .option('--execute', 'Auto-execute tasks after deliberation')
  .action(async (opts) => {
    const { council } = require('../src/commands/council');
    await council(opts);
  });

program.parse();
