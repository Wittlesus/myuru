import type { LanguageModelV1 } from 'ai';
import type { ZodSchema } from 'zod';

// ── Model Types ──

export type Model = LanguageModelV1;

export type ModelConfig = {
  model: Model;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
};

// ── Tool Types ──

export type ToolDefinition<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  parameters: ZodSchema<TInput>;
  execute: (input: TInput) => Promise<TOutput>;
};

// ── Agent Types ──

export type AgentConfig = {
  name: string;
  model: Model;
  instructions?: string;
  tools?: Record<string, ToolDefinition>;
  maxSteps?: number;
  /** Max budget in USD for a single run. Enforced via token counting. */
  budgetPerRun?: number;
  /** Called before each tool execution. Return false to block. */
  onBeforeToolCall?: (toolName: string, args: unknown) => boolean | Promise<boolean>;
};

export type RunOptions = {
  /** Enable tracing for this run */
  trace?: boolean;
  /** Additional context injected into the system prompt */
  context?: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Override maxSteps for this run */
  maxSteps?: number;
  /** Callback after each step completes */
  onStep?: (step: StepResult) => void;
};

export type StepResult = {
  stepNumber: number;
  type: 'text' | 'tool-call' | 'tool-result';
  finishReason: string;
  promptTokens: number;
  completionTokens: number;
  text?: string;
  toolCalls?: ToolCallRecord[];
  toolResults?: ToolResultRecord[];
};

export type ToolCallRecord = {
  id: string;
  name: string;
  args: unknown;
};

export type ToolResultRecord = {
  id: string;
  name: string;
  args: unknown;
  result: unknown;
};

export type AgentResult = {
  text: string;
  steps: StepResult[];
  usage: UsageSummary;
  trace?: TraceRecord;
};

// ── Usage / Cost Types ──

export type UsageSummary = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  stepCount: number;
};

export type CostTable = Record<string, {
  inputPer1k: number;
  outputPer1k: number;
}>;

// ── Trace Types ──

export type TraceRecord = {
  id: string;
  agentName: string;
  startedAt: string;
  completedAt: string;
  input: string;
  output: string;
  steps: StepResult[];
  usage: UsageSummary;
  children: TraceRecord[];
};

// ── Pipeline Types ──

export type PipelineStep = {
  agent: string;
  input: string | ((ctx: PipelineContext) => string | Promise<string>);
  /** If true, pipeline pauses for human approval before this step */
  needsApproval?: boolean;
  /** Run condition. Step is skipped if this returns false. */
  when?: (ctx: PipelineContext) => boolean;
};

export type PipelineConfig = {
  name: string;
  agents: Record<string, AgentConfig>;
  steps: PipelineStep[] | PipelineStepGroup;
  /** Override model for all agents in this pipeline */
  model?: Model;
  trace?: boolean;
  /** Max total budget for the entire pipeline run */
  budget?: number;
  /** Called when a step requires approval */
  onApproval?: (step: PipelineStep, ctx: PipelineContext) => Promise<boolean>;
};

export type PipelineStepGroup = {
  type: 'sequential' | 'parallel';
  steps: (PipelineStep | PipelineStepGroup)[];
};

export type PipelineContext = {
  task: string;
  results: Record<string, string>;
  totalUsage: UsageSummary;
};

export type PipelineResult = {
  name: string;
  results: Record<string, AgentResult>;
  finalOutput: string;
  usage: UsageSummary;
  trace?: TraceRecord;
};

// ── Router Types ──

export type RouterStrategy = 'quality-first' | 'cost-optimized' | 'balanced';

export type RouterConfig = {
  strategy: RouterStrategy;
  models: {
    complex: Model;
    standard: Model;
    simple: Model;
  };
  budget?: {
    maxPerRun?: number;
    maxPerDay?: number;
  };
  /** Custom routing function. Overrides strategy when provided. */
  route?: (input: string, context?: string) => 'complex' | 'standard' | 'simple';
};

// ── Checkpoint Types ──

export type CheckpointData = {
  id: string;
  pipelineName: string;
  createdAt: string;
  updatedAt: string;
  context: PipelineContext;
  completedSteps: string[];
  status: 'running' | 'paused' | 'completed' | 'failed';
};

export type CheckpointStore = {
  save(data: CheckpointData): Promise<void>;
  load(id: string): Promise<CheckpointData | null>;
  list(): Promise<CheckpointData[]>;
  delete(id: string): Promise<void>;
};
