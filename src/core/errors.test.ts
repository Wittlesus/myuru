import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MyUruError,
  BudgetExceededError,
  AgentError,
  ToolBlockedError,
  PipelineError,
  ApprovalDeniedError,
} from './errors.js';

describe('Errors', () => {
  it('MyUruError should have code', () => {
    const err = new MyUruError('test', 'TEST_CODE');
    assert.equal(err.message, 'test');
    assert.equal(err.code, 'TEST_CODE');
    assert.equal(err.name, 'MyUruError');
    assert.ok(err instanceof Error);
  });

  it('BudgetExceededError should include spent/budget', () => {
    const err = new BudgetExceededError(1.5, 1.0);
    assert.equal(err.spent, 1.5);
    assert.equal(err.budget, 1.0);
    assert.equal(err.code, 'BUDGET_EXCEEDED');
    assert.ok(err.message.includes('1.5'));
    assert.ok(err instanceof MyUruError);
  });

  it('AgentError should include agent name', () => {
    const err = new AgentError('failed', 'test-agent');
    assert.equal(err.agentName, 'test-agent');
    assert.ok(err.message.includes('test-agent'));
    assert.equal(err.code, 'AGENT_ERROR');
  });

  it('ToolBlockedError should include tool and agent names', () => {
    const err = new ToolBlockedError('dangerous_tool', 'agent-1');
    assert.equal(err.toolName, 'dangerous_tool');
    assert.equal(err.agentName, 'agent-1');
    assert.equal(err.code, 'TOOL_BLOCKED');
  });

  it('PipelineError should include pipeline name and failed step', () => {
    const err = new PipelineError('step failed', 'my-pipeline', 'step-2');
    assert.equal(err.pipelineName, 'my-pipeline');
    assert.equal(err.failedStep, 'step-2');
    assert.equal(err.code, 'PIPELINE_ERROR');
  });

  it('ApprovalDeniedError should include step and pipeline', () => {
    const err = new ApprovalDeniedError('deploy-step', 'prod-pipeline');
    assert.equal(err.stepAgent, 'deploy-step');
    assert.equal(err.pipelineName, 'prod-pipeline');
    assert.equal(err.code, 'APPROVAL_DENIED');
  });
});
