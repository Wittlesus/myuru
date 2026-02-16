import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from './agent.js';
import { defineTool } from './tool.js';
import { z } from 'zod';
import { BudgetExceededError, AgentError } from './errors.js';

// Mock model that implements LanguageModelV1 interface minimally
function createMockModel(responses: string[] = ['Hello!']) {
  let callCount = 0;
  return {
    specificationVersion: 'v1' as const,
    provider: 'test',
    modelId: 'test-model',
    defaultObjectGenerationMode: 'json' as const,
    supportsStructuredOutputs: false,
    doGenerate: async () => {
      const text = responses[callCount] ?? responses[responses.length - 1];
      callCount++;
      return {
        text,
        finishReason: 'stop' as const,
        usage: { promptTokens: 10, completionTokens: 5 },
        rawCall: { rawPrompt: '', rawSettings: {} },
      };
    },
    doStream: async () => {
      const text = responses[callCount] ?? responses[responses.length - 1];
      callCount++;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'text-delta' as const,
              textDelta: text,
            });
            controller.enqueue({
              type: 'finish' as const,
              finishReason: 'stop' as const,
              usage: { promptTokens: 10, completionTokens: 5 },
            });
            controller.close();
          },
        }),
        rawCall: { rawPrompt: '', rawSettings: {} },
      };
    },
  };
}

describe('Agent', () => {
  it('should construct with minimal config', () => {
    const model = createMockModel();
    const agent = new Agent({
      name: 'test-agent',
      model: model as any,
    });

    assert.equal(agent.name, 'test-agent');
    assert.equal(agent.maxSteps, 10); // default
    assert.deepEqual(agent.tools, {});
  });

  it('should construct with full config', () => {
    const model = createMockModel();
    const agent = new Agent({
      name: 'full-agent',
      model: model as any,
      instructions: 'Be helpful',
      maxSteps: 5,
      budgetPerRun: 1.00,
    });

    assert.equal(agent.name, 'full-agent');
    assert.equal(agent.instructions, 'Be helpful');
    assert.equal(agent.maxSteps, 5);
    assert.equal(agent.budgetPerRun, 1.00);
  });

  it('should run and return result', async () => {
    const model = createMockModel(['Test response']);
    const agent = new Agent({
      name: 'runner',
      model: model as any,
    });

    const result = await agent.run('Hello');

    assert.equal(typeof result.text, 'string');
    assert.ok(Array.isArray(result.steps));
    assert.ok(result.usage);
    assert.equal(typeof result.usage.totalInputTokens, 'number');
    assert.equal(typeof result.usage.totalOutputTokens, 'number');
    assert.equal(typeof result.usage.estimatedCostUsd, 'number');
  });

  it('should include trace when requested', async () => {
    const model = createMockModel(['Traced response']);
    const agent = new Agent({
      name: 'tracer',
      model: model as any,
    });

    const result = await agent.run('Hello', { trace: true });

    assert.ok(result.trace);
    assert.equal(result.trace.agentName, 'tracer');
    assert.ok(result.trace.id);
    assert.ok(result.trace.startedAt);
  });

  it('should call onStep callback', async () => {
    const model = createMockModel(['Step callback test']);
    const agent = new Agent({
      name: 'stepper',
      model: model as any,
    });

    const steps: unknown[] = [];
    await agent.run('Hello', {
      onStep: (step) => steps.push(step),
    });

    assert.ok(steps.length > 0);
  });

  it('should create from NamedTool array', () => {
    const model = createMockModel();
    const tool = defineTool({
      name: 'greet',
      description: 'Greet someone',
      parameters: z.object({ name: z.string() }),
      execute: async ({ name }) => `Hello ${name}!`,
    });

    const agent = Agent.create({
      name: 'tooled',
      model: model as any,
      tools: [tool],
    });

    assert.ok(agent.tools['greet']);
  });

  it('should stream text chunks', async () => {
    const model = createMockModel(['Streamed']);
    const agent = new Agent({
      name: 'streamer',
      model: model as any,
    });

    const chunks: string[] = [];
    const stream = agent.stream('Hello');

    let result;
    while (true) {
      const { value, done } = await stream.next();
      if (done) {
        result = value;
        break;
      }
      chunks.push(value);
    }

    assert.ok(result);
    assert.equal(typeof result.text, 'string');
    assert.ok(result.usage);
  });
});

describe('Agent.create', () => {
  it('should accept empty tools array', () => {
    const model = createMockModel();
    const agent = Agent.create({
      name: 'no-tools',
      model: model as any,
      tools: [],
    });

    assert.deepEqual(agent.tools, {});
  });
});
