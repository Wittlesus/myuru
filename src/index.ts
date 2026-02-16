// MyUru — TypeScript-first multi-agent orchestration framework
// https://github.com/Wittlesus/myuru

// Core primitives
export { Agent } from './core/agent.js';
export { defineTool, toolsToRecord } from './core/tool.js';
export { Pipeline, sequential, parallel } from './core/pipeline.js';
export { ModelRouter } from './core/router.js';
export { Trace, estimateCost } from './core/trace.js';
export { FileCheckpointStore, InMemoryCheckpointStore } from './core/checkpoint.js';

// Errors
export {
  MyUruError,
  AgentError,
  BudgetExceededError,
  ToolBlockedError,
  PipelineError,
  ApprovalDeniedError,
} from './core/errors.js';

// Types
export type {
  Model,
  ModelConfig,
  ToolDefinition,
  AgentConfig,
  RunOptions,
  StepResult,
  AgentResult,
  UsageSummary,
  CostTable,
  TraceRecord,
  PipelineStep,
  PipelineConfig,
  PipelineStepGroup,
  PipelineContext,
  PipelineResult,
  RouterStrategy,
  RouterConfig,
  CheckpointData,
  CheckpointStore,
} from './types/index.js';

// Re-export commonly used AI SDK utilities for convenience
export { tool } from 'ai';
export { z } from 'zod';
