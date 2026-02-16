import { Agent } from '../../core/agent.js';
import type { Model } from '../../types/index.js';

type RunOpts = {
  task: string;
  config: string;
  model?: string;
  provider: string;
  maxSteps: string;
  budget?: string;
  trace?: boolean;
  dryRun?: boolean;
};

export async function runCommand(opts: RunOpts): Promise<void> {
  const maxSteps = parseInt(opts.maxSteps, 10) || 10;
  const budget = opts.budget ? parseFloat(opts.budget) : undefined;

  console.log(`\nMyUru v2 | ${opts.provider}/${opts.model ?? 'default'}`);
  console.log(`Task: ${opts.task.substring(0, 80)}`);
  console.log(`Max steps: ${maxSteps}${budget ? ` | Budget: $${budget}` : ''}`);
  console.log('─'.repeat(50));

  if (opts.dryRun) {
    console.log('\nDry run — would execute the above. Exiting.\n');
    return;
  }

  // Resolve model
  const model = await resolveModel(opts.provider, opts.model);

  const agent = new Agent({
    name: 'cli-agent',
    model,
    instructions: 'You are a helpful AI assistant. Complete the task efficiently.',
    maxSteps,
    budgetPerRun: budget,
  });

  const startTime = Date.now();

  try {
    const result = await agent.run(opts.task, {
      trace: opts.trace,
      onStep: (step) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (step.toolCalls?.length) {
          for (const tc of step.toolCalls) {
            console.log(`  [${elapsed}s] Tool: ${tc.name}`);
          }
        } else if (step.text) {
          const preview = step.text.substring(0, 100).replace(/\n/g, ' ');
          console.log(`  [${elapsed}s] Text: ${preview}...`);
        }
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '─'.repeat(50));
    console.log(result.text);
    console.log('─'.repeat(50));
    console.log(`Steps: ${result.usage.stepCount} | Tokens: ${result.usage.totalTokens} | Cost: $${result.usage.estimatedCostUsd.toFixed(4)} | Time: ${elapsed}s`);
    console.log('');
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

async function resolveModel(provider: string, modelName?: string): Promise<Model> {
  switch (provider) {
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic');
      return anthropic(modelName ?? 'claude-sonnet-4-5');
    }
    case 'openai': {
      const { openai } = await import('@ai-sdk/openai');
      return openai(modelName ?? 'gpt-4o');
    }
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      return google(modelName ?? 'gemini-2.0-flash');
    }
    default:
      throw new Error(`Unknown provider: ${provider}. Use: anthropic, openai, google`);
  }
}
