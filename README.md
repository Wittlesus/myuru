# MyUru

[![npm version](https://img.shields.io/npm/v/myuru.svg)](https://www.npmjs.com/package/myuru)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

TypeScript-first multi-agent orchestration framework. Coordinate AI agents across any provider with built-in tracing, intelligent routing, and production-grade reliability.

## Why MyUru?

- **Provider-agnostic** -- works with Claude, GPT, Gemini, Mistral, and 40+ providers via the Vercel AI SDK
- **TypeScript-native** -- full type safety, no Python bridge, runs anywhere Node runs
- **Built-in observability** -- every run produces token counts, cost estimates, and step-by-step traces
- **Intelligent routing** -- automatically selects the right model for each task based on complexity
- **Pipeline orchestration** -- chain agents sequentially, in parallel, or in mixed patterns with human approval gates
- **Checkpoint/resume** -- long-running pipelines survive crashes and can be resumed from disk

## Installation

```bash
npm install myuru
```

Install at least one provider SDK:

```bash
npm install @ai-sdk/anthropic  # or @ai-sdk/openai, @ai-sdk/google
```

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
console.log(`Cost: $${result.usage.estimatedCostUsd.toFixed(4)}`);
```

### Agent with Tools

```ts
import { Agent, defineTool, z } from 'myuru';
import { openai } from '@ai-sdk/openai';

const searchTool = defineTool({
  name: 'web_search',
  description: 'Search the web for information',
  parameters: z.object({
    query: z.string().describe('The search query'),
  }),
  execute: async ({ query }) => {
    // Your search implementation
    return `Results for: ${query}`;
  },
});

const agent = Agent.create({
  name: 'search-agent',
  model: openai('gpt-4o'),
  instructions: 'Use the search tool to find accurate information.',
  tools: [searchTool],
  maxSteps: 5,
  budgetPerRun: 0.50, // USD limit per run
});

const result = await agent.run('Find the latest Node.js LTS version');
```

### Streaming

```ts
const stream = agent.stream('Write a haiku about TypeScript');

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
// The return value contains the full AgentResult
```

### Pipeline (Multi-Agent)

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
    { agent: 'writer', input: (ctx) => `Write an article using these facts:\n${ctx.results.researcher}` },
    { agent: 'editor', input: (ctx) => `Edit this article:\n${ctx.results.writer}` },
  ],
  trace: true,
});

const result = await pipeline.run('The state of TypeScript in 2026');
console.log(result.finalOutput);
```

### Intelligent Model Routing

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

// Automatically picks the right model based on input complexity
const model = router.select('Analyze the architectural trade-offs of...');
```

### Human Approval Gates

```ts
const pipeline = new Pipeline({
  name: 'deploy-pipeline',
  agents: { /* ... */ },
  steps: [
    { agent: 'planner', input: (ctx) => ctx.task },
    { agent: 'deployer', input: (ctx) => ctx.results.planner, needsApproval: true },
  ],
  onApproval: async (step, ctx) => {
    // Your approval logic -- prompt user, check policy, etc.
    return confirm(`Approve ${step.agent}?`);
  },
});
```

## CLI

```bash
# Initialize a project
npx myuru init

# Run a task
npx myuru run --task "Summarize this codebase" --provider anthropic --trace
```

## API Reference

### `Agent`

| Method | Description |
|--------|-------------|
| `new Agent(config)` | Create an agent with name, model, instructions, tools |
| `Agent.create(config)` | Create from NamedTool array (convenience) |
| `agent.run(input, options?)` | Run and return full result |
| `agent.stream(input, options?)` | Stream text chunks as they arrive |

### `Pipeline`

| Method | Description |
|--------|-------------|
| `new Pipeline(config)` | Create a multi-agent pipeline |
| `pipeline.run(task)` | Execute the pipeline |
| `sequential(steps)` | Group steps to run in order |
| `parallel(steps)` | Group steps to run concurrently |

### `ModelRouter`

| Method | Description |
|--------|-------------|
| `new ModelRouter(config)` | Create with strategy and model tiers |
| `router.select(input)` | Get the best model for this input |
| `router.recordSpend(usd)` | Track spending for budget enforcement |

### `defineTool`

| Method | Description |
|--------|-------------|
| `defineTool(config)` | Create a type-safe tool with Zod schema |

### Result Types

```ts
type AgentResult = {
  text: string;           // Final text output
  steps: StepResult[];    // Step-by-step execution log
  usage: UsageSummary;    // Token counts + cost estimate
  trace?: TraceRecord;    // Full trace (if enabled)
};

type UsageSummary = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  stepCount: number;
};
```

## Requirements

- Node.js >= 20
- At least one AI provider SDK (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`)

## Related Tools

- **[RulesForge](https://github.com/Wittlesus/rulesforge)** -- Auto-generate AI coding rules for any codebase
- **[DepScope](https://github.com/Wittlesus/depscope)** -- Check npm dependency health scores
- **[ScopeGuard](https://github.com/Wittlesus/scopeguard)** -- Prevent AI scope creep with session tracking

## License

MIT - See LICENSE file

---

Built by [@WSDevGuy](https://x.com/WSDevGuy) | [GitHub](https://github.com/Wittlesus/myuru)
