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

// ── .myuru.md project context (like CLAUDE.md, .goosehints) ──

function findProjectContext(cwd: string): { content: string; files: string[] } | undefined {
  const found: { file: string; content: string }[] = [];
  let dir = cwd;

  while (true) {
    const candidate = path.join(dir, '.myuru.md');
    if (fs.existsSync(candidate)) {
      try {
        const content = fs.readFileSync(candidate, 'utf-8').trim();
        if (content) found.push({ file: candidate, content });
      } catch { /* permission errors */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (found.length === 0) return undefined;

  // Root-first ordering (reverse since we walked cwd → root)
  found.reverse();
  return {
    content: found.map(f => f.content).join('\n\n---\n\n'),
    files: found.map(f => f.file),
  };
}

// ── Last session context ──

function loadLastSession(cwd: string): string | undefined {
  const sessionFile = path.join(cwd, '.myuru', 'last-session.md');
  if (!fs.existsSync(sessionFile)) return undefined;
  try {
    const content = fs.readFileSync(sessionFile, 'utf-8').trim();
    return content || undefined;
  } catch { return undefined; }
}

function saveLastSession(cwd: string, messages: unknown[], usage: UsageSummary): void {
  if (messages.length === 0) return;

  const dir = path.join(cwd, '.myuru');
  fs.mkdirSync(dir, { recursive: true });

  const userMessages = (messages as Array<{ role: string; content: unknown }>)
    .filter(m => m.role === 'user')
    .map(m => typeof m.content === 'string' ? m.content : '');

  const lines = [
    '# Last Session',
    `**Date**: ${new Date().toISOString()}`,
    `**Tokens**: ${usage.totalTokens} | **Cost**: $${usage.estimatedCostUsd.toFixed(4)} | **Steps**: ${usage.stepCount}`,
    '',
    '## Topics Discussed',
    ...userMessages.slice(-10).map((m, i) =>
      `${i + 1}. ${m.length > 120 ? m.slice(0, 120) + '...' : m}`
    ),
  ];

  fs.writeFileSync(path.join(dir, 'last-session.md'), lines.join('\n'), 'utf-8');
}

// ── System prompt builder ──

function buildSystemPrompt(
  cwd: string,
  fileTree: string,
  projectContext?: string,
  lastSession?: string,
): string {
  const parts = [
    'You are a helpful coding assistant with full access to the file system and shell.',
    'You can read, write, and edit files, search for files and content, and run shell commands.',
    'Always use your tools to accomplish tasks. Do not ask the user to do things you can do yourself.',
    'When editing files, read them first to understand the current content.',
    'Be concise in your responses. Show what you did, not lengthy explanations of what you plan to do.',
  ];

  if (projectContext) {
    parts.push('', '--- Project Instructions ---', projectContext);
  }

  if (lastSession) {
    parts.push('', '--- Previous Session ---', lastSession);
  }

  parts.push('', `Working directory: ${cwd}`, '', 'Project files:', fileTree);

  return parts.join('\n');
}

// ── Directory scanner ──

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

// ── Session summary ──

function printSessionSummary(usage: UsageSummary): void {
  console.log(`\n\x1b[90m  Session: ${usage.totalTokens} tokens | ${usage.stepCount} steps | $${usage.estimatedCostUsd.toFixed(4)}\x1b[0m\n`);
}

// ── Main command ──

export async function chatCommand(opts: ChatOpts): Promise<void> {
  const available = detectProviders();
  if (available.length === 0 && !opts.provider) {
    console.error('\n  No API key found. Set one of:');
    console.error('    ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY\n');
    process.exit(1);
  }

  const provider = opts.provider ?? available[0].name;
  const modelName = opts.model ?? defaultModelName(provider);
  const model = await resolveModel(provider, opts.model);
  const maxSteps = parseInt(opts.maxSteps ?? '25', 10);
  const budget = opts.budget ? parseFloat(opts.budget) : undefined;

  const cwd = process.cwd();
  const fileTree = scanDirectory(cwd, 2);
  const projectCtx = findProjectContext(cwd);
  const lastSession = loadLastSession(cwd);
  const systemPrompt = buildSystemPrompt(cwd, fileTree, projectCtx?.content, lastSession);

  const agent = Agent.create({
    name: 'myuru',
    model,
    instructions: systemPrompt,
    tools: builtinTools,
    maxSteps,
    budgetPerRun: budget,
  });

  // ── Banner ──
  console.log('');
  console.log('  \x1b[36mmyuru\x1b[0m interactive agent');
  console.log(`  Provider: ${provider} | Model: ${modelName}`);
  if (available.length > 1) {
    console.log(`  Available: ${available.map(p => p.name).join(', ')}`);
  }
  console.log(`  Directory: ${cwd}`);
  if (projectCtx) {
    console.log(`  \x1b[32mLoaded .myuru.md\x1b[0m (${projectCtx.files.length} file${projectCtx.files.length > 1 ? 's' : ''})`);
  }
  if (lastSession) {
    console.log('  \x1b[32mLoaded last session context\x1b[0m');
  }
  console.log(`  Tools: ${builtinTools.map(t => t.toolName).join(', ')}`);
  console.log('');
  console.log('  \x1b[90mTry: "list all TODO comments in this project"');
  console.log('       "explain what src/index.ts does"');
  console.log('       "find and fix any TypeScript errors"');
  console.log('  Commands: /help /clear /compact /cost /exit\x1b[0m');
  console.log('');

  // ── Session state ──
  const messages: unknown[] = [];
  const sessionUsage: UsageSummary = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    stepCount: 0,
  };

  // Streaming state for Ctrl+C cancellation
  let currentAbort: AbortController | null = null;
  let isStreaming = false;

  // ── REPL ──
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[36m> \x1b[0m',
  });

  // Ctrl+C: cancel streaming if active, otherwise exit
  process.on('SIGINT', () => {
    if (isStreaming && currentAbort) {
      currentAbort.abort();
      currentAbort = null;
      isStreaming = false;
      process.stdout.write('\n\x1b[33m  (cancelled)\x1b[0m\n\n');
      rl.prompt();
    } else {
      saveLastSession(cwd, messages, sessionUsage);
      printSessionSummary(sessionUsage);
      process.exit(0);
    }
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // ── Slash commands ──
    if (input.startsWith('/')) {
      const cmd = input.toLowerCase();

      if (cmd === '/exit' || cmd === '/quit') {
        saveLastSession(cwd, messages, sessionUsage);
        printSessionSummary(sessionUsage);
        rl.close();
        return;
      }

      if (cmd === '/cost') {
        printSessionSummary(sessionUsage);
        rl.prompt();
        return;
      }

      if (cmd === '/models') {
        console.log(`\n  Current: ${provider}/${modelName}`);
        console.log(`  Available providers: ${available.map(p => p.name).join(', ')}\n`);
        rl.prompt();
        return;
      }

      if (cmd === '/clear') {
        messages.length = 0;
        console.log('\n  \x1b[33mConversation cleared.\x1b[0m\n');
        rl.prompt();
        return;
      }

      if (cmd === '/help') {
        console.log('');
        console.log('  \x1b[36mCommands:\x1b[0m');
        console.log('    /help     Show this help');
        console.log('    /clear    Clear conversation history');
        console.log('    /compact  Summarize conversation to save context');
        console.log('    /cost     Show session cost and token usage');
        console.log('    /models   Show current model and available providers');
        console.log('    /exit     Exit (also: /quit, Ctrl+D)');
        console.log('');
        console.log('  \x1b[36mKeys:\x1b[0m');
        console.log('    Ctrl+C    Cancel current response');
        console.log('    Ctrl+D    Exit');
        console.log('');
        rl.prompt();
        return;
      }

      if (cmd === '/compact') {
        if (messages.length < 4) {
          console.log('\n  \x1b[90mNothing to compact yet.\x1b[0m\n');
          rl.prompt();
          return;
        }

        console.log('\n  \x1b[33mCompacting conversation...\x1b[0m');
        try {
          const compactPrompt =
            'Summarize our conversation so far in concise bullet points. ' +
            'Include: key topics, files modified, decisions made, and current state. ' +
            'This replaces the conversation history to save context.';

          const prevCount = messages.length;
          const summaryMessages = [
            ...messages,
            { role: 'user' as const, content: compactPrompt },
          ];

          const result = await agent.chat(summaryMessages as any);

          messages.length = 0;
          messages.push(
            { role: 'user' as const, content: 'Summary of our conversation so far:' },
            { role: 'assistant' as const, content: result.text },
          );

          if (result.usage) {
            sessionUsage.totalInputTokens += result.usage.totalInputTokens;
            sessionUsage.totalOutputTokens += result.usage.totalOutputTokens;
            sessionUsage.totalTokens += result.usage.totalTokens;
            sessionUsage.estimatedCostUsd += result.usage.estimatedCostUsd;
            sessionUsage.stepCount += result.usage.stepCount;
          }

          console.log(`  \x1b[32mCompacted: ${prevCount} messages → 2\x1b[0m\n`);
        } catch (err: any) {
          console.error(`\n\x1b[31m  Compact failed: ${err.message}\x1b[0m\n`);
        }

        rl.prompt();
        return;
      }

      console.log(`\n  \x1b[33mUnknown command: ${input}. Type /help for commands.\x1b[0m\n`);
      rl.prompt();
      return;
    }

    // ── User message ──
    messages.push({ role: 'user' as const, content: input });

    try {
      process.stdout.write('\n');
      currentAbort = new AbortController();
      isStreaming = true;

      const stream = agent.chatStream(messages as any, {
        signal: currentAbort.signal,
        onStep: (step) => {
          if (step.toolCalls?.length) {
            for (const tc of step.toolCalls) {
              process.stdout.write(`\x1b[33m  [${tc.name}]\x1b[0m\n`);
            }
          }
        },
      });

      let chatResult;
      let next = await stream.next();
      while (!next.done) {
        process.stdout.write(next.value);
        next = await stream.next();
      }
      chatResult = next.value;

      isStreaming = false;
      currentAbort = null;

      if (chatResult?.responseMessages) {
        messages.push(...chatResult.responseMessages);
      }

      if (chatResult?.usage) {
        sessionUsage.totalInputTokens += chatResult.usage.totalInputTokens;
        sessionUsage.totalOutputTokens += chatResult.usage.totalOutputTokens;
        sessionUsage.totalTokens += chatResult.usage.totalTokens;
        sessionUsage.estimatedCostUsd += chatResult.usage.estimatedCostUsd;
        sessionUsage.stepCount += chatResult.usage.stepCount;
      }

      const tokens = chatResult?.usage.totalTokens ?? 0;
      const cost = (chatResult?.usage.estimatedCostUsd ?? 0).toFixed(4);
      const session = sessionUsage.estimatedCostUsd.toFixed(4);
      process.stdout.write(`\n\n\x1b[90m  ${tokens} tokens | $${cost} | session: $${session}\x1b[0m\n\n`);
    } catch (err: any) {
      isStreaming = false;
      currentAbort = null;

      if (err.name === 'AbortError') {
        // Ctrl+C cancelled — remove the unanswered user message
        if (messages.length > 0 && (messages[messages.length - 1] as any).role === 'user') {
          messages.pop();
        }
      } else {
        console.error(`\n\x1b[31m  Error: ${err.message}\x1b[0m\n`);
      }
    }

    rl.prompt();
  });

  rl.on('close', () => {
    saveLastSession(cwd, messages, sessionUsage);
    printSessionSummary(sessionUsage);
    process.exit(0);
  });
}
