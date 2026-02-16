import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ModelRouter } from './router.js';

const mockModels = {
  complex: { modelId: 'complex', specificationVersion: 'v1' as const, provider: 'test', defaultObjectGenerationMode: undefined, supportsStructuredOutputs: false, doGenerate: async () => ({} as any), doStream: async () => ({} as any) },
  standard: { modelId: 'standard', specificationVersion: 'v1' as const, provider: 'test', defaultObjectGenerationMode: undefined, supportsStructuredOutputs: false, doGenerate: async () => ({} as any), doStream: async () => ({} as any) },
  simple: { modelId: 'simple', specificationVersion: 'v1' as const, provider: 'test', defaultObjectGenerationMode: undefined, supportsStructuredOutputs: false, doGenerate: async () => ({} as any), doStream: async () => ({} as any) },
};

describe('ModelRouter', () => {
  it('should select model based on balanced strategy', () => {
    const router = new ModelRouter({
      strategy: 'balanced',
      models: mockModels as any,
    });

    // Short simple input -> simple model
    const model1 = router.select('Hi');
    assert.equal((model1 as any).modelId, 'simple');

    // Complex input with keywords and length
    const complexInput = 'Analyze and compare the architecture of these systems. Design a comprehensive solution that evaluates all trade-offs. ' + 'x'.repeat(3000);
    const model2 = router.select(complexInput);
    assert.equal((model2 as any).modelId, 'complex');
  });

  it('should use quality-first strategy', () => {
    const router = new ModelRouter({
      strategy: 'quality-first',
      models: mockModels as any,
    });

    // Short input with no complexity signals -> standard in quality-first
    const model1 = router.select('Write a blog post about TypeScript');
    assert.equal((model1 as any).modelId, 'standard');

    // Input with complexity signals -> complex
    const model2 = router.select('Analyze and compare the architecture of these distributed systems in detail');
    assert.equal((model2 as any).modelId, 'complex');
  });

  it('should use cost-optimized strategy', () => {
    const router = new ModelRouter({
      strategy: 'cost-optimized',
      models: mockModels as any,
    });

    // Short simple input -> simple model
    const model = router.select('Hello there');
    assert.equal((model as any).modelId, 'simple');
  });

  it('should respect custom routing function', () => {
    const router = new ModelRouter({
      strategy: 'balanced',
      models: mockModels as any,
      route: (input) => input.includes('urgent') ? 'complex' : 'simple',
    });

    assert.equal((router.select('urgent task') as any).modelId, 'complex');
    assert.equal((router.select('easy task') as any).modelId, 'simple');
  });

  it('should track daily spend', () => {
    const router = new ModelRouter({
      strategy: 'balanced',
      models: mockModels as any,
    });

    assert.equal(router.getDailySpend(), 0);
    router.recordSpend(0.05);
    assert.equal(router.getDailySpend(), 0.05);
    router.recordSpend(0.10);
    assert.ok(Math.abs(router.getDailySpend() - 0.15) < 1e-10);
  });

  it('should downgrade when approaching daily budget', () => {
    const router = new ModelRouter({
      strategy: 'quality-first',
      models: mockModels as any,
      budget: { maxPerDay: 1.00 },
    });

    // Before budget pressure, should use complex
    const model1 = router.select('Analyze this architecture');
    assert.equal((model1 as any).modelId, 'complex');

    // Spend 80% of budget
    router.recordSpend(0.85);

    // Now should downgrade to simple
    const model2 = router.select('Analyze this architecture');
    assert.equal((model2 as any).modelId, 'simple');
  });
});
