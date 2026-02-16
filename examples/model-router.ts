/**
 * Model Router Example — Intelligent Model Selection
 *
 * Run: npx tsx examples/model-router.ts
 * Requires: ANTHROPIC_API_KEY environment variable
 */
import { Agent, ModelRouter } from 'myuru';
import { anthropic } from '@ai-sdk/anthropic';

const router = new ModelRouter({
  strategy: 'cost-optimized',
  models: {
    complex: anthropic('claude-opus-4-6'),
    standard: anthropic('claude-sonnet-4-5'),
    simple: anthropic('claude-haiku-4-5'),
  },
  budget: {
    maxPerDay: 5.00,
  },
});

// The router picks the right model based on input complexity
const tasks = [
  'Hi',
  'Explain the difference between REST and GraphQL',
  'Analyze the architectural trade-offs of microservices vs monoliths for a team of 5 engineers building a real-time collaborative document editor. Consider latency, data consistency, deployment complexity, and team velocity. Compare at least 3 approaches in detail.',
];

for (const task of tasks) {
  const model = router.select(task);
  const modelId = (model as any).modelId ?? 'unknown';

  console.log(`\nTask: "${task.substring(0, 60)}${task.length > 60 ? '...' : ''}"`);
  console.log(`  → Routed to: ${modelId}`);

  const agent = new Agent({
    name: 'routed-agent',
    model,
    instructions: 'Be concise.',
  });

  const result = await agent.run(task);
  router.recordSpend(result.usage.estimatedCostUsd);

  console.log(`  → Response: ${result.text.substring(0, 100)}...`);
  console.log(`  → Cost: $${result.usage.estimatedCostUsd.toFixed(4)} (daily total: $${router.getDailySpend().toFixed(4)})`);
}
