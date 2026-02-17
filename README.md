# MyUru

[![npm version](https://img.shields.io/npm/v/myuru.svg)](https://www.npmjs.com/package/myuru)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

**AI agents that know what they cost.**

MyUru is a TypeScript agent framework with built-in cost intelligence. It routes tasks to the right model automatically, enforces budgets so agents can't burn your API credits, and tracks every token across multi-agent pipelines — so you always know exactly what you're spending and why.

```bash
npm install myuru
```

## The Problem

Most agent frameworks treat your API budget like an afterthought:

- **Wrong model for the job** — Using GPT-4 to format a string. Claude Opus to answer yes/no. You're burning $15/MTok on tasks that need $0.80/MTok.
- **No spending limits** — An agent loop hits 50 iterations and you find out when the invoice arrives.
- **Invisible costs** — Multi-agent pipelines finish and you have no idea which agent cost what.
- **Crash = start over** — A 20-minute pipeline fails on step 9 of 10. Everything is lost.

MyUru solves all of these.

## Quick Start

### Single Agent

```ts
import { Agent } from 'myuru';
import { anthropic } from '@ai-sdk/anthropic';

const agent = new Agent({
  name: 'researcher',
  model: anthropic('claude-sonnet-4-5'),
  instructions: 'You are a research assistant. Be concise and accurate.',
});

const result = await agent.run('What are the top TypeScript frameworks in 2026?');
console.log(result.text);
console.log(`Tokens: ${result.usage.totalTokens}`);
console.log(`Cost: $${result.usage.estimatedCostUsd.toFixed(4)}`);
```

Every `agent.run()` returns token counts and cost estimates. No extra setup.

### Cost-Intelligent Model Routing

Stop overpaying. Let MyUru pick the right model for each task:

```ts
import { ModelRouter } from 'myuru';
import { anthropic } from '@ai-sdk/anthropic';

const router = new ModelRouter({
  strategy: 'cost-optimized', // or 'quality-first', 'balanced'
  models: {
    complex: anthropic('claude-opus-4-6'),
    standard: anthropic('claude-sonnet-4-5'),
    simple: anthropic('claude-haiku-4-5'),
  },
  budget: { maxPerDay: 10.00 },
});

// Simple question → Haiku ($0.80/MTok)
router.select('What is 2+2?');

// Architecture analysis → Opus ($15/MTok)
router.select('Analyze the trade-offs between microservices and monolith for this codebase...');
```

The router uses input length, complexity signals (code blocks, multiple questions, analytical keywords), and remaining budget to pick the cheapest model that can handle the task.

### Budget Enforcement

Set a hard ceiling. The agent stops before it overspends:

```ts
const agent = Agent.create({
  name: 'search-agent',
  model: openai('gpt-4o'),
  instructions: 'Search for accurate information.',
  tools: [searchTool],
  maxSteps: 10,
  budgetPerRun: 0.50, // Hard stop at $0.50
});

// Throws BudgetExceededError if the agent tries to exceed $0.50
const result = await agent.run('Research everything about quantum computing');
```

### Multi-Agent Pipelines

Chain agents in sequence, parallel, or mixed patterns:

```ts
import { Agent, Pipeline, parallel } from 'myuru';
import { anthropic } from '@ai-sdk/anthropic';

const model = anthropic('claude-sonnet-4-5');

const pipeline = new Pipeline({
  name: 'research-and-write',
  agents: {
    researcher: { name: 'researcher', model, instructions: 'Find key facts.' },
    writer: { name: 'writer', model, instructions: 'Write clear, engaging content.' },
    editor: { name: 'editor', model, instructions: 'Fix grammar and improve clarity.' },
  },
  steps: [
    { agent: 'researcher', input: (ctx) => `Research: ${ctx.task}` },
    { agent: 'writer', input: (ctx) => `Write using these facts:\n${ctx.results.researcher}` },
    { agent: 'editor', input: (ctx) => `Edit this:\n${ctx.results.writer}` },
  ],
  budget: 2.00, // Pipeline-level budget cap
  trace: true,  // See per-agent cost breakdown
});

const result = await pipeline.run('The state of TypeScript in 2026');
console.log(result.finalOutput);
// Trace shows: researcher $0.12, writer $0.08, editor $0.03 = $0.23 total
```

### Crash Recovery

Long pipelines survive interruptions:

```ts
import { FileCheckpointStore } from 'myuru';

const store = new FileCheckpointStore('.myuru/checkpoints');
const pipeline = new Pipeline({
  // ... agents and steps ...
  checkpointStore: store, // Saves progress after each step
});

// If this crashes on step 9 of 10, the next run resumes from step 9
await pipeline.run('Process 500 documents');
```

### Human Approval Gates

Pause the pipeline for human review before critical steps:

```ts
const pipeline = new Pipeline({
  name: 'deploy-pipeline',
  agents: { planner: { ... }, deployer: { ... } },
  steps: [
    { agent: 'planner', input: (ctx) => ctx.task },
    { agent: 'deployer', input: (ctx) => ctx.results.planner, needsApproval: true },
  ],
  onApproval: async (step, ctx) => {
    return confirm(`Deploy with this plan?\n${ctx.results.planner}`);
  },
});
```

### Streaming

```ts
const stream = agent.stream('Write a haiku about TypeScript');

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

### Agent Tools

```ts
import { Agent, defineTool, z } from 'myuru';

const searchTool = defineTool({
  name: 'web_search',
  description: 'Search the web for information',
  parameters: z.object({
    query: z.string().describe('The search query'),
  }),
  execute: async ({ query }) => {
    return `Results for: ${query}`;
  },
});

const agent = Agent.create({
  name: 'search-agent',
  model: anthropic('claude-sonnet-4-5'),
  instructions: 'Use search to find accurate information.',
  tools: [searchTool],
  maxSteps: 5,
});
```

### Built-in File Tools

MyUru ships with tools for reading, writing, editing files, running commands, and searching — ready for coding agents:

```ts
import { Agent, builtinTools } from 'myuru';

const codingAgent = new Agent({
  name: 'coder',
  model: anthropic('claude-sonnet-4-5'),
  instructions: 'You are a coding assistant.',
  tools: builtinTools,
  maxSteps: 20,
});

await codingAgent.run('Read src/index.ts and add error handling');
```

## CLI

```bash
# Initialize a project with config file
npx myuru init

# Run a one-shot task
npx myuru run --task "Summarize this codebase" --provider anthropic --trace

# Interactive chat
npx myuru chat --provider anthropic
```

## Provider Support

MyUru works with any provider supported by the [Vercel AI SDK](https://sdk.vercel.ai/):

```bash
npm install @ai-sdk/anthropic  # Claude
npm install @ai-sdk/openai     # GPT, o1
npm install @ai-sdk/google     # Gemini
# + 40 more providers
```

## API Reference

### Agent

| Method | Description |
|--------|-------------|
| `new Agent(config)` | Create with name, model, instructions, tools, budget |
| `Agent.create(config)` | Create from NamedTool array |
| `agent.run(input, options?)` | Run and return result with usage stats |
| `agent.stream(input, options?)` | Stream text chunks, return result at end |
| `agent.chat(messages, options?)` | Multi-turn conversation with message history |
| `agent.chatStream(messages, options?)` | Streaming multi-turn conversation |

### Pipeline

| Method | Description |
|--------|-------------|
| `new Pipeline(config)` | Create with agents, steps, budget, checkpointing |
| `pipeline.run(task)` | Execute and return all results with total cost |
| `sequential(steps)` | Group steps to run in order |
| `parallel(steps)` | Group steps to run concurrently |

### ModelRouter

| Method | Description |
|--------|-------------|
| `new ModelRouter(config)` | Create with strategy, model tiers, budget |
| `router.select(input)` | Get the right model for this input |
| `router.recordSpend(usd)` | Track spending for budget enforcement |
| `router.getDailySpend()` | Check current daily spend |

### Result Types

```ts
interface AgentResult {
  text: string;           // Final output
  steps: StepResult[];    // Step-by-step execution log
  usage: UsageSummary;    // Token counts + cost
  trace?: TraceRecord;    // Full trace tree (if enabled)
}

interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  stepCount: number;
}
```

## Requirements

- Node.js >= 20
- At least one AI provider SDK

## Related Tools

- **[RulesForge](https://github.com/Wittlesus/rulesforge)** — Auto-generate AI coding rules for any codebase
- **[DepScope](https://github.com/Wittlesus/depscope)** — Check npm dependency health scores
- **[ScopeGuard](https://github.com/Wittlesus/scopeguard)** — Prevent AI scope creep with session tracking

## License

MIT

---

Built by [@WSDevGuy](https://x.com/WSDevGuy) | [GitHub](https://github.com/Wittlesus/myuru)
