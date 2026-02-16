# MyUru v2 Architecture

## Positioning
The TypeScript-first multi-agent orchestration framework that actually works in production.

## Core Design Principles

1. **Simple things should be simple, complex things should be possible**
   - Single agent = 5 lines of code (OpenAI SDK simplicity)
   - Multi-agent pipeline = declarative composition (LangGraph power)

2. **Provider-agnostic by default**
   - Vercel AI SDK under the hood (40+ providers)
   - Swap models with one line change
   - Intelligent routing across providers

3. **Production-first, not demo-first**
   - Built-in tracing and cost tracking
   - Checkpoint/resume for long-running tasks
   - Self-healing with retries and model fallback
   - Human approval gates

4. **Security by default**
   - Sandboxed tool execution
   - Capability-based permissions
   - Per-agent resource budgets

## Core Primitives

### Agent
The fundamental unit. Wraps an LLM with instructions, tools, and memory.

```typescript
import { Agent } from 'myuru';
import { anthropic } from '@ai-sdk/anthropic';

const agent = new Agent({
  name: 'researcher',
  model: anthropic('claude-sonnet-4-5'),
  instructions: 'You are a research assistant.',
  tools: [searchTool],
});

const result = await agent.run('Find info about TypeScript frameworks');
```

### Tool
Type-safe tool definitions with Zod schemas.

```typescript
import { tool } from 'myuru';
import { z } from 'zod';

const searchTool = tool({
  name: 'web_search',
  description: 'Search the web for information',
  parameters: z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().default(5),
  }),
  execute: async ({ query, maxResults }) => {
    // implementation
  },
});
```

### Pipeline
Compose agents into workflows with sequential, parallel, and router patterns.

```typescript
import { Pipeline, sequential, parallel, router } from 'myuru';

const pipeline = new Pipeline({
  name: 'research-and-write',
  steps: sequential([
    parallel([
      { agent: webResearcher, input: 'Search the web' },
      { agent: codeAnalyzer, input: 'Analyze the codebase' },
    ]),
    { agent: writer, input: 'Write based on findings' },
    { agent: reviewer, input: 'Review the draft', needsApproval: true },
  ]),
});

const result = await pipeline.run('Write about agent frameworks');
```

### Router
Intelligent model selection based on task characteristics.

```typescript
import { ModelRouter } from 'myuru';

const router = new ModelRouter({
  strategy: 'cost-optimized', // 'quality-first' | 'balanced' | 'cost-optimized'
  budget: { maxPerRun: 5.00 },
  models: {
    complex: anthropic('claude-opus-4-6'),
    standard: anthropic('claude-sonnet-4-5'),
    simple: anthropic('claude-haiku-4-5'),
  },
});
```

### Trace
Built-in observability. Every decision, tool call, and cost is tracked.

```typescript
import { Trace } from 'myuru';

// Traces are automatic when you run agents
const result = await agent.run('Do something', { trace: true });

// Access trace data
console.log(result.trace.totalCost);
console.log(result.trace.decisions);
console.log(result.trace.toolCalls);

// Replay a trace
await Trace.replay(result.trace.id);
```

## Directory Structure

```
src/
  core/
    agent.ts          - Agent class
    tool.ts           - Tool definition
    pipeline.ts       - Pipeline orchestration
    router.ts         - Model router
    trace.ts          - Tracing/observability
    checkpoint.ts     - State persistence
    errors.ts         - Error types
  providers/
    index.ts          - Re-exports Vercel AI SDK providers
  cli/
    index.ts          - CLI entry point (commander)
    commands/
      init.ts         - myuru init
      run.ts          - myuru run
      dev.ts          - myuru dev (local playground)
      observe.ts      - myuru observe (trace viewer)
  types/
    index.ts          - Shared TypeScript types
  index.ts            - Public API exports
```

## Dependencies

- `ai` (Vercel AI SDK) - Provider abstraction, streaming, tool calling
- `@ai-sdk/anthropic` - Anthropic provider
- `@ai-sdk/openai` - OpenAI provider
- `@ai-sdk/google` - Google provider
- `zod` - Schema validation (already a Vercel AI SDK peer dep)
- `commander` - CLI framework
- `nanoid` - ID generation

## What We're NOT Building (Yet)

- Web UI / dashboard (Phase 2)
- Cloud deployment (Phase 3)
- Agent marketplace (Phase 3)
- VS Code extension (Phase 3)
- A2A protocol (Phase 3)
