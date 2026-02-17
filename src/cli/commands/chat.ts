import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Agent } from '../../core/agent.js';
import { builtinTools } from '../../tools/index.js';
import { detectProviders, resolveModel, defaultModelName } from '../resolve-model.js';
import type { UsageSummary } from '../../types/index.js';

type ChatOpts = {
  provider?: string;
  model?: string;
  maxSteps?: string;
  budget?: string;
};

export async function chatCommand(opts: ChatOpts): Promise<void> {
  // Detect available providers
  const available = detectProviders();
  if (available.length === 0 && !opts.provider) {
    console.error('\n  No API key found. Set one of:');
    console.error('    ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY\n');
    process.exit(1);
  }

  // Resolve which provider/model to use
  const provider = opts.provider ?? available[0].name;
  const modelName = opts.model ?? defaultModelName(provider);
  const model = await resolveModel(provider, opts.model);
  const maxSteps = parseInt(opts.maxSteps ?? '25', 10);
  const budget = opts.budget ? parseFloat(opts.budget) : undefined;

  // Build system prompt with working directory context
  const cwd = process.cwd();
  const fileTree = scanDirectory(cwd, 2);
  const systemPrompt = buildSystemPrompt(cwd, fileTree);

  // Create the agent with built-in tools
  const agent = Agent.create({
    name: 'myuru',
    model,
    instructions: systemPrompt,
    tools: builtinTools,
    maxSteps,
    budgetPerRun: budget,
  });

  // Print banner
  console.log('');
  console.log('  \x1b[36mmyuru\x1b[0m interactive agent');
  console.log(`  Provider: ${provider} | Model: ${modelName}`);
  if (available.length > 1) {
    console.log(`  Available: ${available.map(p => p.name).join(', ')}`);
  }
  console.log(`  Directory: ${cwd}`);
  console.log(`  Tools: ${builtinTools.map(t => t.toolName).join(', ')}`);
  console.log('  Type /exit to quit, /cost for session totals\n');

  // Session state
  const messages: unknown[] = [];
  const sessionUsage: UsageSummary = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    stepCount: 0,
  };

  // REPL
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[36m> \x1b[0m',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // Slash commands
    if (input === '/exit' || input === '/quit') {
      printSessionSummary(sessionUsage);
      rl.close();
      return;
    }
    if (input === '/cost') {
      printSessionSummary(sessionUsage);
      rl.prompt();
      return;
    }
    if (input === '/models') {
      console.log(`\n  Current: ${provider}/${modelName}`);
      console.log(`  Available providers: ${available.map(p => p.name).join(', ')}\n`);
      rl.prompt();
      return;
    }

    // Add user message to history
    messages.push({ role: 'user' as const, content: input });

    // Stream the response
    try {
      process.stdout.write('\n');
      const stream = agent.chatStream(messages as any, {
        onStep: (step) => {
          if (step.toolCalls?.length) {
            for (const tc of step.toolCalls) {
              process.stdout.write(`\x1b[33m  [${tc.name}]\x1b[0m\n`);
            }
          }
        },
      });

      // Manual loop to capture the generator return value
      let chatResult;
      let next = await stream.next();
      while (!next.done) {
        process.stdout.write(next.value);
        next = await stream.next();
      }
      chatResult = next.value;

      // Append response messages to history
      if (chatResult?.responseMessages) {
        messages.push(...chatResult.responseMessages);
      }

      // Update session usage
      if (chatResult?.usage) {
        sessionUsage.totalInputTokens += chatResult.usage.totalInputTokens;
        sessionUsage.totalOutputTokens += chatResult.usage.totalOutputTokens;
        sessionUsage.totalTokens += chatResult.usage.totalTokens;
        sessionUsage.estimatedCostUsd += chatResult.usage.estimatedCostUsd;
        sessionUsage.stepCount += chatResult.usage.stepCount;
      }

      // Print cost line
      const tokens = chatResult?.usage.totalTokens ?? 0;
      const cost = (chatResult?.usage.estimatedCostUsd ?? 0).toFixed(4);
      const session = sessionUsage.estimatedCostUsd.toFixed(4);
      process.stdout.write(`\n\n\x1b[90m  ${tokens} tokens | $${cost} | session: $${session}\x1b[0m\n\n`);
    } catch (err: any) {
      console.error(`\n\x1b[31m  Error: ${err.message}\x1b[0m\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    printSessionSummary(sessionUsage);
    process.exit(0);
  });

  process.on('SIGINT', () => {
    printSessionSummary(sessionUsage);
    process.exit(0);
  });
}

function printSessionSummary(usage: UsageSummary): void {
  console.log(`\n\x1b[90m  Session: ${usage.totalTokens} tokens | ${usage.stepCount} steps | $${usage.estimatedCostUsd.toFixed(4)}\x1b[0m\n`);
}

function buildSystemPrompt(cwd: string, fileTree: string): string {
  return [
    'You are a helpful coding assistant with full access to the file system and shell.',
    'You can read, write, and edit files, search for files and content, and run shell commands.',
    'Always use your tools to accomplish tasks. Do not ask the user to do things you can do yourself.',
    'When editing files, read them first to understand the current content.',
    'Be concise in your responses. Show what you did, not lengthy explanations of what you plan to do.',
    '',
    `Working directory: ${cwd}`,
    '',
    'Project files:',
    fileTree,
  ].join('\n');
}

function scanDirectory(dir: string, maxDepth: number, depth = 0, prefix = ''): string {
  if (depth >= maxDepth) return '';
  const lines: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist')
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    for (const entry of entries.slice(0, 30)) {
      const name = entry.isDirectory() ? `${entry.name}/` : entry.name;
      lines.push(`${prefix}${name}`);
      if (entry.isDirectory()) {
        const sub = scanDirectory(path.join(dir, entry.name), maxDepth, depth + 1, prefix + '  ');
        if (sub) lines.push(sub);
      }
    }
  } catch { /* permission errors */ }
  return lines.filter(Boolean).join('\n');
}
