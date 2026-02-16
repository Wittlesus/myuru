/**
 * Pipeline Example — Multi-Agent Orchestration
 *
 * Run: npx tsx examples/pipeline.ts
 * Requires: ANTHROPIC_API_KEY environment variable
 */
import { Pipeline } from 'myuru';
import { anthropic } from '@ai-sdk/anthropic';

const model = anthropic('claude-sonnet-4-5');

const pipeline = new Pipeline({
  name: 'research-and-write',
  agents: {
    researcher: {
      name: 'researcher',
      model,
      instructions: 'You are a research analyst. Find key facts and data points. Be thorough but concise.',
    },
    writer: {
      name: 'writer',
      model,
      instructions: 'You are a technical writer. Turn research into clear, engaging content. Use headers and bullet points.',
    },
    editor: {
      name: 'editor',
      model,
      instructions: 'You are an editor. Fix grammar, improve clarity, and ensure accuracy. Return the final polished version.',
    },
  },
  steps: [
    {
      agent: 'researcher',
      input: (ctx) => `Research the following topic and provide key facts:\n\n${ctx.task}`,
    },
    {
      agent: 'writer',
      input: (ctx) => `Write a short article based on this research:\n\n${ctx.results.researcher}`,
    },
    {
      agent: 'editor',
      input: (ctx) => `Edit and polish this article:\n\n${ctx.results.writer}`,
    },
  ],
  trace: true,
});

console.log('Running pipeline: research → write → edit\n');

const result = await pipeline.run('The current state of TypeScript in server-side development');

console.log('--- Final Output ---\n');
console.log(result.finalOutput);
console.log('\n--- Pipeline Stats ---');
console.log(`Agents used: ${Object.keys(result.results).join(', ')}`);
console.log(`Total steps: ${result.usage.stepCount}`);
console.log(`Total tokens: ${result.usage.totalTokens}`);
console.log(`Total cost: $${result.usage.estimatedCostUsd.toFixed(4)}`);
