/**
 * Streaming Example
 *
 * Run: npx tsx examples/streaming.ts
 * Requires: ANTHROPIC_API_KEY environment variable
 */
import { Agent } from 'myuru';
import { anthropic } from '@ai-sdk/anthropic';

const agent = new Agent({
  name: 'streamer',
  model: anthropic('claude-sonnet-4-5'),
  instructions: 'You are a creative writing assistant.',
});

console.log('Streaming response:\n');

const stream = agent.stream('Write a haiku about TypeScript');

let result;
for await (const chunk of stream) {
  process.stdout.write(chunk);
}

// When the stream finishes, the return value is the full AgentResult
// (Note: for-await doesn't capture the return value, use .next() pattern if needed)

console.log('\n\nStream complete.');
