export class MyUruError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MyUruError';
  }
}

export class BudgetExceededError extends MyUruError {
  constructor(
    public readonly spent: number,
    public readonly budget: number,
  ) {
    super(
      `Budget exceeded: spent $${spent.toFixed(4)}, limit $${budget.toFixed(2)}`,
      'BUDGET_EXCEEDED',
    );
    this.name = 'BudgetExceededError';
  }
}

export class AgentError extends MyUruError {
  constructor(
    message: string,
    public readonly agentName: string,
    public readonly cause?: Error,
  ) {
    super(`[${agentName}] ${message}`, 'AGENT_ERROR');
    this.name = 'AgentError';
  }
}

export class ToolBlockedError extends MyUruError {
  constructor(
    public readonly toolName: string,
    public readonly agentName: string,
  ) {
    super(
      `Tool "${toolName}" was blocked by onBeforeToolCall in agent "${agentName}"`,
      'TOOL_BLOCKED',
    );
    this.name = 'ToolBlockedError';
  }
}

export class PipelineError extends MyUruError {
  constructor(
    message: string,
    public readonly pipelineName: string,
    public readonly failedStep?: string,
    public readonly cause?: Error,
  ) {
    super(`[Pipeline: ${pipelineName}] ${message}`, 'PIPELINE_ERROR');
    this.name = 'PipelineError';
  }
}

export class ApprovalDeniedError extends MyUruError {
  constructor(
    public readonly stepAgent: string,
    public readonly pipelineName: string,
  ) {
    super(
      `Approval denied for step "${stepAgent}" in pipeline "${pipelineName}"`,
      'APPROVAL_DENIED',
    );
    this.name = 'ApprovalDeniedError';
  }
}
