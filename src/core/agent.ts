import { generateText, streamText, stepCountIs } from 'ai';
import type {
  Model,
  AgentConfig,
  RunOptions,
  StepResult,
  AgentResult,
  UsageSummary,
  ToolCallRecord,
  ToolResultRecord,
} from '../types/index.js';
import { Trace, estimateCost } from './trace.js';
import { AgentError, BudgetExceededError } from './errors.js';
import type { NamedTool } from './tool.js';
import { toolsToRecord } from './tool.js';

const DEFAULT_MAX_STEPS = 10;

/**
 * Agent — the core primitive of MyUru.
 *
 * Wraps an LLM with instructions, tools, and built-in tracing.
 * Uses the Vercel AI SDK under the hood for provider-agnostic model access.
 *
 * ```ts
 * import { Agent } from 'myuru';
 * import { anthropic } from '@ai-sdk/anthropic';
 *
 * const agent = new Agent({
 *   name: 'researcher',
 *   model: anthropic('claude-sonnet-4-5'),
 *   instructions: 'You are a research assistant.',
 *   tools: { search: searchTool },
 * });
 *
 * const result = await agent.run('Find info about TypeScript frameworks');
 * console.log(result.text);
 * console.log(result.usage.estimatedCostUsd);
 * ```
 */
export class Agent {
  readonly name: string;
  readonly model: Model;
  readonly instructions: string;
  readonly tools: Record<string, unknown>;
  readonly maxSteps: number;
  readonly budgetPerRun?: number;
  readonly onBeforeToolCall?: (toolName: string, args: unknown) => boolean | Promise<boolean>;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.model = config.model;
    this.instructions = config.instructions ?? '';
    this.maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
    this.budgetPerRun = config.budgetPerRun;
    this.onBeforeToolCall = config.onBeforeToolCall;

    // Accept tools in various formats
    if (config.tools) {
      this.tools = {};
      for (const [key, val] of Object.entries(config.tools)) {
        this.tools[key] = val as unknown;
      }
    } else {
      this.tools = {};
    }
  }

  /**
   * Create an Agent from NamedTool array (convenience).
   */
  static create(config: Omit<AgentConfig, 'tools'> & { tools?: NamedTool[] }): Agent {
    const toolRecord = config.tools ? toolsToRecord(config.tools) : {};
    return new Agent({ ...config, tools: toolRecord as unknown as AgentConfig['tools'] });
  }

  /**
   * Run the agent on an input. Returns the full result with tracing.
   */
  async run(input: string, options?: RunOptions): Promise<AgentResult> {
    const trace = new Trace(this.name);
    trace.setInput(input);

    const steps: StepResult[] = [];
    let runCost = 0;

    const system = this.buildSystemPrompt(options?.context);
    const maxSteps = options?.maxSteps ?? this.maxSteps;

    try {
      const result = await generateText({
        model: this.model,
        system,
        prompt: input,
        tools: Object.keys(this.tools).length > 0 ? (this.tools as any) : undefined,
        stopWhen: stepCountIs(maxSteps),
        abortSignal: options?.signal,
        onStepFinish: (stepResult: Record<string, unknown>) => {
          const usage = stepResult.usage as { inputTokens?: number; outputTokens?: number } | undefined;
          const modelId = this.extractModelId();
          const promptTokens = usage?.inputTokens ?? 0;
          const completionTokens = usage?.outputTokens ?? 0;
          const stepCost = estimateCost(modelId, promptTokens, completionTokens);
          runCost += stepCost;

          const step = this.mapStep(stepResult, steps.length);
          steps.push(step);
          trace.addStep(step);
          trace.addCost(stepCost);

          options?.onStep?.(step);

          // Budget enforcement
          if (this.budgetPerRun && runCost > this.budgetPerRun) {
            throw new BudgetExceededError(runCost, this.budgetPerRun);
          }
        },
      });

      const usage = this.summarizeUsage(steps, runCost);
      trace.complete(result.text);

      if (options?.trace) {
        trace.print();
      }

      return {
        text: result.text,
        steps,
        usage,
        trace: options?.trace ? trace.toRecord() : undefined,
      };
    } catch (error) {
      if (error instanceof BudgetExceededError) throw error;
      throw new AgentError(
        error instanceof Error ? error.message : String(error),
        this.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Stream the agent's response. Yields text chunks as they arrive.
   */
  async *stream(
    input: string,
    options?: RunOptions,
  ): AsyncGenerator<string, AgentResult> {
    const trace = new Trace(this.name);
    trace.setInput(input);

    const steps: StepResult[] = [];
    let runCost = 0;
    let finalText = '';

    const system = this.buildSystemPrompt(options?.context);
    const maxSteps = options?.maxSteps ?? this.maxSteps;

    const result = streamText({
      model: this.model,
      system,
      prompt: input,
      tools: Object.keys(this.tools).length > 0 ? (this.tools as any) : undefined,
      stopWhen: stepCountIs(maxSteps),
      abortSignal: options?.signal,
      onStepFinish: (stepResult: Record<string, unknown>) => {
        const usage = stepResult.usage as { promptTokens?: number; completionTokens?: number } | undefined;
        const modelId = this.extractModelId();
        const promptTokens = usage?.promptTokens ?? 0;
        const completionTokens = usage?.completionTokens ?? 0;
        const stepCost = estimateCost(modelId, promptTokens, completionTokens);
        runCost += stepCost;

        const step = this.mapStep(stepResult, steps.length);
        steps.push(step);
        trace.addStep(step);
        trace.addCost(stepCost);
        options?.onStep?.(step);
      },
    });

    for await (const chunk of result.textStream) {
      finalText += chunk;
      yield chunk;
    }

    const usage = this.summarizeUsage(steps, runCost);
    trace.complete(finalText);

    if (options?.trace) {
      trace.print();
    }

    return {
      text: finalText,
      steps,
      usage,
      trace: options?.trace ? trace.toRecord() : undefined,
    };
  }

  private buildSystemPrompt(context?: string): string | undefined {
    const parts: string[] = [];
    if (this.instructions) parts.push(this.instructions);
    if (context) parts.push(`\n---\nAdditional context:\n${context}`);
    return parts.length > 0 ? parts.join('\n') : undefined;
  }

  private extractModelId(): string {
    return (this.model as unknown as { modelId?: string }).modelId ?? 'default';
  }

  // Use Record<string, unknown> to avoid AI SDK generic type complexity
  private mapStep(stepResult: Record<string, unknown>, index: number): StepResult {
    const usage = stepResult.usage as { inputTokens?: number; outputTokens?: number } | undefined;
    const rawToolCalls = stepResult.toolCalls as Array<{ toolCallId: string; toolName: string; args: unknown }> | undefined;
    const rawToolResults = stepResult.toolResults as Array<{ toolCallId: string; toolName: string; args: unknown; result: unknown }> | undefined;

    const toolCalls: ToolCallRecord[] = (rawToolCalls ?? []).map((tc) => ({
      id: tc.toolCallId,
      name: tc.toolName,
      args: tc.args,
    }));

    const toolResults: ToolResultRecord[] = (rawToolResults ?? []).map((tr) => ({
      id: tr.toolCallId,
      name: tr.toolName,
      args: tr.args,
      result: tr.result,
    }));

    return {
      stepNumber: index,
      type: toolCalls.length > 0 ? 'tool-call' : 'text',
      finishReason: stepResult.finishReason as string,
      promptTokens: usage?.inputTokens ?? 0,
      completionTokens: usage?.outputTokens ?? 0,
      text: (stepResult.text as string) || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
    };
  }

  private summarizeUsage(steps: StepResult[], totalCost: number): UsageSummary {
    let inputTokens = 0;
    let outputTokens = 0;

    for (const step of steps) {
      inputTokens += step.promptTokens;
      outputTokens += step.completionTokens;
    }

    return {
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCostUsd: totalCost,
      stepCount: steps.length,
    };
  }
}
