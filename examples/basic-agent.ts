/**
 * Basic Agent Example
 *
 * Run: npx tsx examples/basic-agent.ts
 * Requires: ANTHROPIC_API_KEY environment variable
 */
import { Agent } from 'myuru';
import { anthropic } from '@ai-sdk/anthropic';

const agent = new Agent({
  name: 'assistant',
  model: anthropic('claude-sonnet-4-5'),
  instructions: 'You are a helpful assistant. Be concise.',
});

const result = await agent.run('What are the 3 most popular TypeScript frameworks?', {
  trace: true,
});

console.log('\n--- Response ---');
console.log(result.text);
console.log('\n--- Usage ---');
console.log(`Steps: ${result.usage.stepCount}`);
console.log(`Tokens: ${result.usage.totalInputTokens} in / ${result.usage.totalOutputTokens} out`);
console.log(`Cost: $${result.usage.estimatedCostUsd.toFixed(4)}`);
