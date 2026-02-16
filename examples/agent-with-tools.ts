/**
 * Agent with Tools Example
 *
 * Run: npx tsx examples/agent-with-tools.ts
 * Requires: ANTHROPIC_API_KEY environment variable
 */
import { Agent, defineTool, z } from 'myuru';
import { anthropic } from '@ai-sdk/anthropic';

// Define a simple calculator tool
const calculator = defineTool({
  name: 'calculate',
  description: 'Perform basic math calculations',
  parameters: z.object({
    expression: z.string().describe('A math expression like "2 + 2" or "15 * 3"'),
  }),
  execute: async ({ expression }) => {
    // Simple eval for demo — use a real math parser in production
    const sanitized = expression.replace(/[^0-9+\-*/().% ]/g, '');
    try {
      return `${sanitized} = ${Function(`"use strict"; return (${sanitized})`)()}`;
    } catch {
      return `Could not evaluate: ${expression}`;
    }
  },
});

// Define a weather tool (mock)
const weather = defineTool({
  name: 'get_weather',
  description: 'Get current weather for a location',
  parameters: z.object({
    city: z.string().describe('City name'),
  }),
  execute: async ({ city }) => {
    // Mock response — replace with real API call
    return `${city}: 72F, partly cloudy, humidity 45%`;
  },
});

const agent = Agent.create({
  name: 'tooled-assistant',
  model: anthropic('claude-sonnet-4-5'),
  instructions: 'You have access to a calculator and weather tool. Use them when relevant.',
  tools: [calculator, weather],
  maxSteps: 5,
  budgetPerRun: 0.50,
});

const result = await agent.run(
  'What is 15% of 847? Also, what is the weather in San Francisco?',
  {
    trace: true,
    onStep: (step) => {
      if (step.toolCalls?.length) {
        for (const tc of step.toolCalls) {
          console.log(`  Tool called: ${tc.name}(${JSON.stringify(tc.args)})`);
        }
      }
    },
  },
);

console.log('\n--- Response ---');
console.log(result.text);
console.log(`\nCost: $${result.usage.estimatedCostUsd.toFixed(4)}`);
