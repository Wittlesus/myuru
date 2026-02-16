import { tool as aiTool } from 'ai';
import type { ZodSchema } from 'zod';
import type { CoreTool } from 'ai';

/**
 * Define a type-safe tool for MyUru agents.
 *
 * This is a thin wrapper around the Vercel AI SDK's `tool()` function
 * that adds our naming convention and future extensibility.
 *
 * ```ts
 * import { defineTool } from 'myuru';
 * import { z } from 'zod';
 *
 * const searchTool = defineTool({
 *   name: 'web_search',
 *   description: 'Search the web',
 *   parameters: z.object({
 *     query: z.string().describe('Search query'),
 *   }),
 *   execute: async ({ query }) => {
 *     return `Results for: ${query}`;
 *   },
 * });
 * ```
 */
export function defineTool<TInput, TOutput>(config: {
  name: string;
  description: string;
  parameters: ZodSchema<TInput>;
  execute: (input: TInput) => Promise<TOutput>;
}): NamedTool<TInput, TOutput> {
  const coreTool = aiTool({
    description: config.description,
    parameters: config.parameters,
    execute: config.execute as (input: TInput) => Promise<TOutput>,
  });

  return {
    ...coreTool,
    toolName: config.name,
  };
}

/**
 * A CoreTool with an attached name for identification in traces and pipelines.
 */
export type NamedTool<TInput = unknown, TOutput = unknown> = CoreTool & {
  toolName: string;
};

/**
 * Convert a record of NamedTools to the format expected by the AI SDK.
 * Keys are the tool names.
 */
export function toolsToRecord(tools: NamedTool[]): Record<string, CoreTool> {
  const record: Record<string, CoreTool> = {};
  for (const t of tools) {
    record[t.toolName] = t;
  }
  return record;
}
