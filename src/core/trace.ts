import { nanoid } from 'nanoid';
import type {
  TraceRecord,
  StepResult,
  UsageSummary,
} from '../types/index.js';

/**
 * Trace — built-in observability for every agent run.
 *
 * Captures steps, tool calls, token usage, and cost.
 * Traces can be nested (pipeline → agent → sub-agent).
 */
export class Trace {
  readonly id: string;
  readonly agentName: string;
  readonly startedAt: string;

  private input = '';
  private output = '';
  private steps: StepResult[] = [];
  private children: Trace[] = [];
  private completedAt: string | null = null;

  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private estimatedCostUsd = 0;

  constructor(agentName: string) {
    this.id = nanoid(12);
    this.agentName = agentName;
    this.startedAt = new Date().toISOString();
  }

  setInput(input: string): void {
    this.input = input;
  }

  addStep(step: StepResult): void {
    this.steps.push(step);
    this.totalInputTokens += step.promptTokens;
    this.totalOutputTokens += step.completionTokens;
  }

  addCost(costUsd: number): void {
    this.estimatedCostUsd += costUsd;
  }

  addChild(child: Trace): void {
    this.children.push(child);
  }

  complete(output: string): void {
    this.output = output;
    this.completedAt = new Date().toISOString();
  }

  get usage(): UsageSummary {
    // Include children's usage
    let inputTokens = this.totalInputTokens;
    let outputTokens = this.totalOutputTokens;
    let cost = this.estimatedCostUsd;
    let stepCount = this.steps.length;

    for (const child of this.children) {
      const childUsage = child.usage;
      inputTokens += childUsage.totalInputTokens;
      outputTokens += childUsage.totalOutputTokens;
      cost += childUsage.estimatedCostUsd;
      stepCount += childUsage.stepCount;
    }

    return {
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCostUsd: cost,
      stepCount,
    };
  }

  toRecord(): TraceRecord {
    return {
      id: this.id,
      agentName: this.agentName,
      startedAt: this.startedAt,
      completedAt: this.completedAt ?? new Date().toISOString(),
      input: this.input,
      output: this.output,
      steps: [...this.steps],
      usage: this.usage,
      children: this.children.map(c => c.toRecord()),
    };
  }

  /** Print a human-readable summary to console */
  print(): void {
    const u = this.usage;
    const dur = this.completedAt
      ? (new Date(this.completedAt).getTime() - new Date(this.startedAt).getTime()) / 1000
      : 0;

    console.log(`\n--- Trace: ${this.agentName} (${this.id}) ---`);
    console.log(`  Steps: ${u.stepCount}`);
    console.log(`  Tokens: ${u.totalInputTokens} in / ${u.totalOutputTokens} out (${u.totalTokens} total)`);
    console.log(`  Cost: $${u.estimatedCostUsd.toFixed(4)}`);
    console.log(`  Duration: ${dur.toFixed(1)}s`);

    if (this.children.length > 0) {
      console.log(`  Sub-traces: ${this.children.length}`);
      for (const child of this.children) {
        const cu = child.usage;
        console.log(`    - ${child.agentName}: ${cu.stepCount} steps, $${cu.estimatedCostUsd.toFixed(4)}`);
      }
    }
    console.log('');
  }
}

/**
 * Estimate cost based on model ID string and token counts.
 * These are approximate — actual billing depends on provider.
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[modelId] ?? MODEL_PRICING['default'];
  return (inputTokens / 1000) * pricing.inputPer1k +
         (outputTokens / 1000) * pricing.outputPer1k;
}

const MODEL_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  // Anthropic
  'claude-opus-4-6': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'claude-sonnet-4-5-20250929': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-haiku-4-5-20251001': { inputPer1k: 0.0008, outputPer1k: 0.004 },
  // OpenAI
  'gpt-4o': { inputPer1k: 0.0025, outputPer1k: 0.01 },
  'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'o1': { inputPer1k: 0.015, outputPer1k: 0.06 },
  // Google
  'gemini-2.0-flash': { inputPer1k: 0.0001, outputPer1k: 0.0004 },
  'gemini-2.0-pro': { inputPer1k: 0.00125, outputPer1k: 0.005 },
  // Default fallback
  'default': { inputPer1k: 0.003, outputPer1k: 0.015 },
};
