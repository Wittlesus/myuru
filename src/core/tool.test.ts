import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defineTool, toolsToRecord } from './tool.js';
import { z } from 'zod';

describe('defineTool', () => {
  it('should create a named tool', () => {
    const tool = defineTool({
      name: 'search',
      description: 'Search the web',
      parameters: z.object({
        query: z.string(),
      }),
      execute: async ({ query }) => `Results for: ${query}`,
    });

    assert.equal(tool.toolName, 'search');
    assert.ok('toolName' in tool);
  });

  it('should execute correctly', async () => {
    const tool = defineTool({
      name: 'add',
      description: 'Add numbers',
      parameters: z.object({
        a: z.number(),
        b: z.number(),
      }),
      execute: async ({ a, b }) => a + b,
    });

    assert.equal(tool.toolName, 'add');
  });
});

describe('toolsToRecord', () => {
  it('should convert array to keyed record', () => {
    const t1 = defineTool({
      name: 'tool_a',
      description: 'A',
      parameters: z.object({}),
      execute: async () => 'a',
    });
    const t2 = defineTool({
      name: 'tool_b',
      description: 'B',
      parameters: z.object({}),
      execute: async () => 'b',
    });

    const record = toolsToRecord([t1, t2]);
    assert.ok(record['tool_a']);
    assert.ok(record['tool_b']);
    assert.equal(Object.keys(record).length, 2);
  });

  it('should handle empty array', () => {
    const record = toolsToRecord([]);
    assert.deepEqual(record, {});
  });
});
