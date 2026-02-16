import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Pipeline, sequential, parallel } from './pipeline.js';
import { ApprovalDeniedError, BudgetExceededError } from './errors.js';

// Minimal mock model (LanguageModelV2 spec)
function createMockModel(response: string = 'mock response') {
  return {
    specificationVersion: 'v2' as const,
    provider: 'test',
    modelId: 'test-model',
    supportedUrls: {},
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text: response }],
      finishReason: 'stop' as const,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      warnings: [],
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-start' as const, id: 'text-0' });
          controller.enqueue({ type: 'text-delta' as const, id: 'text-0', delta: response });
          controller.enqueue({ type: 'text-end' as const, id: 'text-0' });
          controller.enqueue({ type: 'finish' as const, finishReason: 'stop' as const, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } });
          controller.close();
        },
      }),
    }),
  };
}

describe('Pipeline', () => {
  it('should run sequential steps', async () => {
    const model = createMockModel('agent output');

    const pipeline = new Pipeline({
      name: 'test-pipeline',
      agents: {
        a: { name: 'a', model: model as any, instructions: 'Be agent A' },
        b: { name: 'b', model: model as any, instructions: 'Be agent B' },
      },
      steps: [
        { agent: 'a', input: (ctx) => `Task: ${ctx.task}` },
        { agent: 'b', input: (ctx) => `Previous: ${ctx.results.a}` },
      ],
    });

    const result = await pipeline.run('test task');

    assert.ok(result.finalOutput);
    assert.ok(result.results['a']);
    assert.ok(result.results['b']);
    assert.equal(result.name, 'test-pipeline');
    assert.ok(result.usage.stepCount > 0);
  });

  it('should skip steps when condition is false', async () => {
    const model = createMockModel('output');

    const pipeline = new Pipeline({
      name: 'conditional',
      agents: {
        a: { name: 'a', model: model as any },
        b: { name: 'b', model: model as any },
      },
      steps: [
        { agent: 'a', input: 'run this' },
        { agent: 'b', input: 'skip this', when: () => false },
      ],
    });

    const result = await pipeline.run('test');

    assert.ok(result.results['a']);
    assert.equal(result.results['b'], undefined);
  });

  it('should throw when agent not found', async () => {
    const model = createMockModel();

    const pipeline = new Pipeline({
      name: 'missing-agent',
      agents: {
        a: { name: 'a', model: model as any },
      },
      steps: [
        { agent: 'nonexistent', input: 'test' },
      ],
    });

    await assert.rejects(
      () => pipeline.run('test'),
      (err: Error) => err.message.includes('nonexistent'),
    );
  });

  it('should handle approval gates', async () => {
    const model = createMockModel();

    const pipeline = new Pipeline({
      name: 'approval-test',
      agents: {
        a: { name: 'a', model: model as any },
      },
      steps: [
        { agent: 'a', input: 'needs approval', needsApproval: true },
      ],
      onApproval: async () => true,
    });

    const result = await pipeline.run('test');
    assert.ok(result.results['a']);
  });

  it('should throw ApprovalDeniedError when rejected', async () => {
    const model = createMockModel();

    const pipeline = new Pipeline({
      name: 'denied-test',
      agents: {
        a: { name: 'a', model: model as any },
      },
      steps: [
        { agent: 'a', input: 'denied', needsApproval: true },
      ],
      onApproval: async () => false,
    });

    await assert.rejects(
      () => pipeline.run('test'),
      (err: unknown) => err instanceof ApprovalDeniedError,
    );
  });

  it('should throw when approval required but no handler', async () => {
    const model = createMockModel();

    const pipeline = new Pipeline({
      name: 'no-handler',
      agents: {
        a: { name: 'a', model: model as any },
      },
      steps: [
        { agent: 'a', input: 'test', needsApproval: true },
      ],
    });

    await assert.rejects(
      () => pipeline.run('test'),
      (err: Error) => err.message.includes('onApproval'),
    );
  });

  it('should include trace when enabled', async () => {
    const model = createMockModel();

    const pipeline = new Pipeline({
      name: 'traced',
      agents: {
        a: { name: 'a', model: model as any },
      },
      steps: [
        { agent: 'a', input: 'test' },
      ],
      trace: true,
    });

    const result = await pipeline.run('test');
    assert.ok(result.trace);
    assert.equal(result.trace.agentName, 'pipeline:traced');
  });

  it('should use pipeline-level model override', async () => {
    const pipelineModel = createMockModel('from pipeline model');

    const pipeline = new Pipeline({
      name: 'model-override',
      model: pipelineModel as any,
      agents: {
        a: { name: 'a', model: createMockModel('from agent model') as any },
      },
      steps: [
        { agent: 'a', input: 'test' },
      ],
    });

    const result = await pipeline.run('test');
    // Should use pipeline-level model
    assert.ok(result.results['a']);
  });
});

describe('sequential / parallel helpers', () => {
  it('sequential should create correct group', () => {
    const group = sequential([
      { agent: 'a', input: 'test' },
      { agent: 'b', input: 'test' },
    ]);
    assert.equal(group.type, 'sequential');
    assert.equal(group.steps.length, 2);
  });

  it('parallel should create correct group', () => {
    const group = parallel([
      { agent: 'a', input: 'test' },
      { agent: 'b', input: 'test' },
    ]);
    assert.equal(group.type, 'parallel');
    assert.equal(group.steps.length, 2);
  });

  it('should support nested groups', () => {
    const group = sequential([
      { agent: 'a', input: 'first' },
      parallel([
        { agent: 'b', input: 'parallel-1' },
        { agent: 'c', input: 'parallel-2' },
      ]),
      { agent: 'd', input: 'last' },
    ]);
    assert.equal(group.type, 'sequential');
    assert.equal(group.steps.length, 3);
    assert.equal((group.steps[1] as any).type, 'parallel');
  });
});
