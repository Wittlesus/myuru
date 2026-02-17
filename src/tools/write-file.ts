import { defineTool } from '../core/tool.js';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const writeFileTool = defineTool({
  name: 'write_file',
  description: 'Write content to a file. Creates parent directories if needed. Overwrites existing content.',
  parameters: z.object({
    path: z.string().describe('Path to the file to write'),
    content: z.string().describe('Content to write to the file'),
  }),
  execute: async ({ path: filePath, content }) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return `Wrote ${content.length} characters to ${filePath}`;
  },
});
