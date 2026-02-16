import type { ZodSchema } from 'zod';

/**
 * The shape of a tool that the AI SDK accepts.
 * We define this ourselves to avoid fighting AI SDK v6 overload generics.
 * At runtime, tool() is literally an identity function, so this is equivalent.
 */
type AiTool = {
  description: string;
  parameters: ZodSchema;
  execute: (input: any) => Promise<any>;
};

/**
 * Define a type-safe tool for MyUru agents.
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
}): NamedTool {
  return {
    description: config.description,
    parameters: config.parameters,
    execute: config.execute as (input: any) => Promise<any>,
    toolName: config.name,
  };
}

/**
 * A tool with an attached name for identification in traces and pipelines.
 */
export type NamedTool = AiTool & {
  toolName: string;
};

/**
 * Convert a record of NamedTools to the format expected by the AI SDK.
 * Keys are the tool names.
 */
export function toolsToRecord(tools: NamedTool[]): Record<string, AiTool> {
  const record: Record<string, AiTool> = {};
  for (const t of tools) {
    record[t.toolName] = t;
  }
  return record;
}
