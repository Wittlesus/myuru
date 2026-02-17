import { defineTool } from '../core/tool.js';
import { z } from 'zod';
import * as fs from 'node:fs';

export const readFileTool = defineTool({
  name: 'read_file',
  description: 'Read the contents of a file. Optionally specify a line range.',
  parameters: z.object({
    path: z.string().describe('Absolute or relative path to the file'),
    start_line: z.number().optional().describe('First line to read (1-based)'),
    end_line: z.number().optional().describe('Last line to read (1-based, inclusive)'),
  }),
  execute: async ({ path: filePath, start_line, end_line }) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (start_line || end_line) {
      const lines = content.split('\n');
      const start = (start_line ?? 1) - 1;
      const end = end_line ?? lines.length;
      return lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
    }
    return content;
  },
});
