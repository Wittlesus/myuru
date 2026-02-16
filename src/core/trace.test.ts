import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Trace, estimateCost } from './trace.js';

describe('Trace', () => {
  it('should create with agent name and ID', () => {
    const trace = new Trace('test-agent');
    assert.equal(trace.agentName, 'test-agent');
    assert.ok(trace.id);
    assert.ok(trace.startedAt);
  });

  it('should track steps and token usage', () => {
    const trace = new Trace('agent');
    trace.setInput('test input');

    trace.addStep({
      stepNumber: 0,
      type: 'text',
      finishReason: 'stop',
      promptTokens: 100,
      completionTokens: 50,
      text: 'Hello',
    });

    trace.addCost(0.001);

    const usage = trace.usage;
    assert.equal(usage.totalInputTokens, 100);
    assert.equal(usage.totalOutputTokens, 50);
    assert.equal(usage.totalTokens, 150);
    assert.equal(usage.stepCount, 1);
    assert.equal(usage.estimatedCostUsd, 0.001);
  });

  it('should include child trace usage', () => {
    const parent = new Trace('parent');
    const child = new Trace('child');

    parent.addStep({
      stepNumber: 0,
      type: 'text',
      finishReason: 'stop',
      promptTokens: 100,
      completionTokens: 50,
    });
    parent.addCost(0.001);

    child.addStep({
      stepNumber: 0,
      type: 'text',
      finishReason: 'stop',
      promptTokens: 200,
      completionTokens: 100,
    });
    child.addCost(0.002);

    parent.addChild(child);

    const usage = parent.usage;
    assert.equal(usage.totalInputTokens, 300);
    assert.equal(usage.totalOutputTokens, 150);
    assert.equal(usage.estimatedCostUsd, 0.003);
    assert.equal(usage.stepCount, 2);
  });

  it('should convert to record', () => {
    const trace = new Trace('agent');
    trace.setInput('input');
    trace.complete('output');

    const record = trace.toRecord();
    assert.equal(record.agentName, 'agent');
    assert.equal(record.input, 'input');
    assert.equal(record.output, 'output');
    assert.ok(record.completedAt);
    assert.ok(Array.isArray(record.steps));
    assert.ok(Array.isArray(record.children));
  });
});

describe('estimateCost', () => {
  it('should estimate cost for known models', () => {
    const cost = estimateCost('gpt-4o', 1000, 500);
    // gpt-4o: $0.0025/1k input, $0.01/1k output
    const expected = (1000 / 1000) * 0.0025 + (500 / 1000) * 0.01;
    assert.equal(cost, expected);
  });

  it('should use default pricing for unknown models', () => {
    const cost = estimateCost('unknown-model', 1000, 1000);
    // default: $0.003/1k input, $0.015/1k output
    const expected = (1000 / 1000) * 0.003 + (1000 / 1000) * 0.015;
    assert.equal(cost, expected);
  });

  it('should return 0 for zero tokens', () => {
    assert.equal(estimateCost('gpt-4o', 0, 0), 0);
  });
});
