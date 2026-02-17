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

// ── Session memory (structured logs saved at compact time) ──

function getSessionsDir(cwd: string): string {
  const dir = path.join(cwd, '.myuru', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

function saveSessionLog(cwd: string, structuredSummary: string, msgCount: number, usage: UsageSummary): string {
  const sessionsDir = getSessionsDir(cwd);
  const timestamp = makeTimestamp();
  const filename = `${timestamp}.md`;

  const header = [
    `# Session Log — ${new Date().toISOString()}`,
    `**Messages**: ${msgCount} | **Tokens**: ${usage.totalTokens} | **Cost**: $${usage.estimatedCostUsd.toFixed(4)}`,
    '',
  ].join('\n');

  fs.writeFileSync(path.join(sessionsDir, filename), header + structuredSummary, 'utf-8');

  // Update index — one-line summary per compaction for cheap scanning
  updateSessionIndex(cwd, timestamp, msgCount, structuredSummary);

  return filename;
}

function updateSessionIndex(cwd: string, timestamp: string, msgCount: number, summary: string): void {
  const indexPath = path.join(getSessionsDir(cwd), 'index.md');

  // Extract first meaningful line from summary as a topic hint
  const topicLine = summary
    .split('\n')
    .find(l => l.startsWith('- ') || (l.length > 5 && !l.startsWith('#') && !l.startsWith('*')));
  const topic = topicLine
    ? topicLine.replace(/^-\s*/, '').slice(0, 80)
    : 'session';

  const entry = `${timestamp} | ${msgCount} msgs | ${topic}\n`;

  // Create or append
  if (fs.existsSync(indexPath)) {
    fs.appendFileSync(indexPath, entry, 'utf-8');
  } else {
    fs.writeFileSync(indexPath, '# Session Log Index\n\n' + entry, 'utf-8');
  }
}

function loadSessionIndex(cwd: string): string | undefined {
  const indexPath = path.join(cwd, '.myuru', 'sessions', 'index.md');
  if (!fs.existsSync(indexPath)) return undefined;
  try {
    const content = fs.readFileSync(indexPath, 'utf-8').trim();
    return content || undefined;
  } catch { return undefined; }
}

// ── Context size estimation ──

function getContextLimit(modelName: string): number {
  const name = modelName.toLowerCase();
  if (name.includes('claude')) return 200000;
  if (name.includes('gpt-4o-mini')) return 128000;
  if (name.includes('gpt-4o')) return 128000;
  if (name.includes('gpt-4')) return 128000;
  if (name.includes('gemini')) return 1000000;
  return 128000;
}

function estimateContextTokens(messages: unknown[], systemPromptLength: number): number {
  let totalChars = systemPromptLength;
  for (const msg of messages) {
    const m = msg as { content?: unknown };
    if (typeof m.content === 'string') {
      totalChars += m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (typeof part === 'string') totalChars += part.length;
        else if (part && typeof part === 'object' && 'text' in part) {
          totalChars += String((part as { text: string }).text).length;
        }
      }
    }
  }
  return Math.ceil(totalChars / 4); // ~4 chars per token rough estimate
}

// ── Compact extraction prompt ──

const EXTRACTION_PROMPT = `Analyze our entire conversation and produce a structured session log. Use this exact format:

## Files Modified
- path/to/file (what was changed)

## Decisions Made
- Decision description

## Key Facts Learned
- Important facts about the project, codebase, or requirements

## Current State
- What we're currently working on
- What's been completed
- What's pending/next

Omit any section that has no entries. Be concise — bullet points only, no prose. This log will be saved for future reference and will also replace our conversation to free up context space.`;

// ── System prompt builder ──

function buildSystemPrompt(
  cwd: string,
  fileTree: string,
  projectContext?: string,
  lastSession?: string,
  sessionIndex?: string,
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

  if (sessionIndex) {
    parts.push(
      '', '--- Session Memory ---',
      'Previous session logs are saved in .myuru/sessions/. If the user references something',
      'you don\'t have context for, use search_content or read_file on .myuru/sessions/ to find it.',
      'Session index:', sessionIndex,
    );
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

// ── Compact logic (shared between /compact and auto-compact) ──

async function performCompact(
  agent: Agent,
  messages: unknown[],
  sessionUsage: UsageSummary,
  cwd: string,
): Promise<{ success: boolean; prevCount: number; filename?: string }> {
  const prevCount = messages.length;

  const summaryMessages = [
    ...messages,
    { role: 'user' as const, content: EXTRACTION_PROMPT },
  ];

  const result = await agent.chat(summaryMessages as any);
  const structuredSummary = result.text;

  // Save full structured log to .myuru/sessions/
  const filename = saveSessionLog(cwd, structuredSummary, prevCount, sessionUsage);

  // Replace conversation with the compacted summary
  messages.length = 0;
  messages.push(
    { role: 'user' as const, content: 'Here is a summary of our conversation so far (full log saved to .myuru/sessions/):' },
    { role: 'assistant' as const, content: structuredSummary },
  );

  // Track the compact call's own usage
  if (result.usage) {
    sessionUsage.totalInputTokens += result.usage.totalInputTokens;
    sessionUsage.totalOutputTokens += result.usage.totalOutputTokens;
    sessionUsage.totalTokens += result.usage.totalTokens;
    sessionUsage.estimatedCostUsd += result.usage.estimatedCostUsd;
    sessionUsage.stepCount += result.usage.stepCount;
  }

  return { success: true, prevCount, filename };
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
  const sessionIndex = loadSessionIndex(cwd);
  const contextLimit = getContextLimit(modelName);
  const systemPrompt = buildSystemPrompt(cwd, fileTree, projectCtx?.content, lastSession, sessionIndex);

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
  if (sessionIndex) {
    console.log('  \x1b[32mLoaded session memory index\x1b[0m');
  }
  console.log(`  Tools: ${builtinTools.map(t => t.toolName).join(', ')}`);
  console.log('');
  console.log('  \x1b[90mTry: "list all TODO comments in this project"');
  console.log('       "explain what src/index.ts does"');
  console.log('       "find and fix any TypeScript errors"');
  console.log('  Commands: /help /clear /compact /history /cost /exit\x1b[0m');
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
  let autoCompactWarned = false;

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
        const estTokens = estimateContextTokens(messages, systemPrompt.length);
        const pct = Math.round((estTokens / contextLimit) * 100);
        console.log(`\n\x1b[90m  Session: ${sessionUsage.totalTokens} tokens | ${sessionUsage.stepCount} steps | $${sessionUsage.estimatedCostUsd.toFixed(4)}`);
        console.log(`  Context: ~${estTokens.toLocaleString()} / ${contextLimit.toLocaleString()} tokens (~${pct}%)\x1b[0m\n`);
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
        autoCompactWarned = false;
        console.log('\n  \x1b[33mConversation cleared.\x1b[0m\n');
        rl.prompt();
        return;
      }

      if (cmd === '/help') {
        console.log('');
        console.log('  \x1b[36mCommands:\x1b[0m');
        console.log('    /help     Show this help');
        console.log('    /clear    Clear conversation history');
        console.log('    /compact  Save & compress conversation (preserves to .myuru/sessions/)');
        console.log('    /history  Show session memory index');
        console.log('    /cost     Show session cost, token usage, and context fill');
        console.log('    /models   Show current model and available providers');
        console.log('    /exit     Exit (also: /quit, Ctrl+D)');
        console.log('');
        console.log('  \x1b[36mKeys:\x1b[0m');
        console.log('    Ctrl+C    Cancel current response');
        console.log('    Ctrl+D    Exit');
        console.log('');
        console.log('  \x1b[36mMemory:\x1b[0m');
        console.log('    .myuru.md            Project context (loaded every session)');
        console.log('    .myuru/last-session.md  Auto-saved at exit, loaded at start');
        console.log('    .myuru/sessions/     Structured logs from /compact (searchable)');
        console.log('');
        rl.prompt();
        return;
      }

      if (cmd === '/history') {
        const index = loadSessionIndex(cwd);
        if (!index) {
          console.log('\n  \x1b[90mNo session logs yet. Use /compact to save one.\x1b[0m\n');
        } else {
          console.log(`\n${index}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/compact') {
        if (messages.length < 4) {
          console.log('\n  \x1b[90mNothing to compact yet.\x1b[0m\n');
          rl.prompt();
          return;
        }

        console.log('\n  \x1b[33mCompacting — extracting structured log and saving...\x1b[0m');
        try {
          const result = await performCompact(agent, messages, sessionUsage, cwd);
          autoCompactWarned = false;
          console.log(`  \x1b[32mSaved to .myuru/sessions/${result.filename}\x1b[0m`);
          console.log(`  \x1b[32mCompacted: ${result.prevCount} messages → 2\x1b[0m\n`);
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

      // ── Auto-compact warning ──
      if (!autoCompactWarned) {
        const estTokens = estimateContextTokens(messages, systemPrompt.length);
        const fillPct = estTokens / contextLimit;
        if (fillPct >= 0.75) {
          const pct = Math.round(fillPct * 100);
          console.log(`  \x1b[33m⚠ Context is ~${pct}% full (~${estTokens.toLocaleString()} tokens).`);
          console.log(`    Run /compact to save and compress. Your session log will be preserved.\x1b[0m\n`);
          autoCompactWarned = true;
        }
      }
    } catch (err: any) {
      isStreaming = false;
      currentAbort = null;

      if (err.name === 'AbortError') {
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
