import { Agent } from './agent.js';
import { Trace } from './trace.js';
import {
  PipelineError,
  ApprovalDeniedError,
  BudgetExceededError,
} from './errors.js';
import type {
  PipelineConfig,
  PipelineStep,
  PipelineStepGroup,
  PipelineContext,
  PipelineResult,
  AgentResult,
  UsageSummary,
} from '../types/index.js';

/**
 * Pipeline — orchestrate multiple agents in sequence, parallel, or mixed patterns.
 *
 * ```ts
 * const pipeline = new Pipeline({
 *   name: 'research-and-write',
 *   agents: {
 *     researcher: { name: 'researcher', model, instructions: '...' },
 *     writer:     { name: 'writer', model, instructions: '...' },
 *   },
 *   steps: [
 *     { agent: 'researcher', input: (ctx) => `Research: ${ctx.task}` },
 *     { agent: 'writer', input: (ctx) => `Write about: ${ctx.results.researcher}` },
 *   ],
 * });
 *
 * const result = await pipeline.run('TypeScript agent frameworks');
 * ```
 */
export class Pipeline {
  readonly name: string;
  private agents: Map<string, Agent>;
  private steps: PipelineStep[] | PipelineStepGroup;
  private budget?: number;
  private enableTrace: boolean;
  private onApproval?: (step: PipelineStep, ctx: PipelineContext) => Promise<boolean>;

  constructor(config: PipelineConfig) {
    this.name = config.name;
    this.steps = config.steps;
    this.budget = config.budget;
    this.enableTrace = config.trace ?? false;
    this.onApproval = config.onApproval;

    // Instantiate agents
    this.agents = new Map();
    for (const [key, agentConfig] of Object.entries(config.agents)) {
      const model = config.model ?? agentConfig.model;
      this.agents.set(key, new Agent({ ...agentConfig, model }));
    }
  }

  /**
   * Run the pipeline on a task.
   */
  async run(task: string): Promise<PipelineResult> {
    const trace = new Trace(`pipeline:${this.name}`);
    trace.setInput(task);

    const ctx: PipelineContext = {
      task,
      results: {},
      totalUsage: emptyUsage(),
    };

    const agentResults: Record<string, AgentResult> = {};

    try {
      if (Array.isArray(this.steps)) {
        // Simple sequential steps
        for (const step of this.steps) {
          await this.executeStep(step, ctx, agentResults, trace);
        }
      } else {
        // Structured step group (sequential/parallel)
        await this.executeGroup(this.steps, ctx, agentResults, trace);
      }

      // Final output is the last agent's text
      const resultKeys = Object.keys(agentResults);
      const finalOutput = resultKeys.length > 0
        ? agentResults[resultKeys[resultKeys.length - 1]].text
        : '';

      trace.complete(finalOutput);

      if (this.enableTrace) {
        trace.print();
      }

      return {
        name: this.name,
        results: agentResults,
        finalOutput,
        usage: ctx.totalUsage,
        trace: this.enableTrace ? trace.toRecord() : undefined,
      };
    } catch (error) {
      if (error instanceof BudgetExceededError) throw error;
      if (error instanceof ApprovalDeniedError) throw error;

      throw new PipelineError(
        error instanceof Error ? error.message : String(error),
        this.name,
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  }

  private async executeStep(
    step: PipelineStep,
    ctx: PipelineContext,
    results: Record<string, AgentResult>,
    parentTrace: Trace,
  ): Promise<void> {
    // Check condition
    if (step.when && !step.when(ctx)) return;

    // Check approval
    if (step.needsApproval) {
      if (!this.onApproval) {
        throw new PipelineError(
          `Step "${step.agent}" requires approval but no onApproval handler is configured`,
          this.name,
          step.agent,
        );
      }
      const approved = await this.onApproval(step, ctx);
      if (!approved) {
        throw new ApprovalDeniedError(step.agent, this.name);
      }
    }

    const agent = this.agents.get(step.agent);
    if (!agent) {
      throw new PipelineError(
        `Agent "${step.agent}" not found. Available: ${[...this.agents.keys()].join(', ')}`,
        this.name,
        step.agent,
      );
    }

    // Resolve input
    const input = typeof step.input === 'function'
      ? await step.input(ctx)
      : step.input;

    // Budget check
    if (this.budget && ctx.totalUsage.estimatedCostUsd >= this.budget) {
      throw new BudgetExceededError(ctx.totalUsage.estimatedCostUsd, this.budget);
    }

    // Run agent
    const result = await agent.run(input, { trace: this.enableTrace });
    results[step.agent] = result;
    ctx.results[step.agent] = result.text;

    // Accumulate usage
    ctx.totalUsage = addUsage(ctx.totalUsage, result.usage);

    // Add to parent trace
    if (result.trace) {
      const childTrace = new Trace(step.agent);
      childTrace.complete(result.text);
      parentTrace.addChild(childTrace);
    }
  }

  private async executeGroup(
    group: PipelineStepGroup,
    ctx: PipelineContext,
    results: Record<string, AgentResult>,
    parentTrace: Trace,
  ): Promise<void> {
    if (group.type === 'sequential') {
      for (const item of group.steps) {
        if ('type' in item) {
          await this.executeGroup(item as PipelineStepGroup, ctx, results, parentTrace);
        } else {
          await this.executeStep(item as PipelineStep, ctx, results, parentTrace);
        }
      }
    } else if (group.type === 'parallel') {
      await Promise.all(
        group.steps.map(async (item) => {
          if ('type' in item) {
            await this.executeGroup(item as PipelineStepGroup, ctx, results, parentTrace);
          } else {
            await this.executeStep(item as PipelineStep, ctx, results, parentTrace);
          }
        }),
      );
    }
  }
}

// ── Helpers ──

/** Create sequential step group */
export function sequential(
  steps: (PipelineStep | PipelineStepGroup)[],
): PipelineStepGroup {
  return { type: 'sequential', steps };
}

/** Create parallel step group */
export function parallel(
  steps: (PipelineStep | PipelineStepGroup)[],
): PipelineStepGroup {
  return { type: 'parallel', steps };
}

function emptyUsage(): UsageSummary {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    stepCount: 0,
  };
}

function addUsage(a: UsageSummary, b: UsageSummary): UsageSummary {
  return {
    totalInputTokens: a.totalInputTokens + b.totalInputTokens,
    totalOutputTokens: a.totalOutputTokens + b.totalOutputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    estimatedCostUsd: a.estimatedCostUsd + b.estimatedCostUsd,
    stepCount: a.stepCount + b.stepCount,
  };
}
