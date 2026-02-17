import { defineTool } from '../core/tool.js';
import { z } from 'zod';
import * as fs from 'node:fs';

export const listDirectoryTool = defineTool({
  name: 'list_directory',
  description: 'List files and directories at the given path. Directories have a trailing /.',
  parameters: z.object({
    path: z.string().describe('Directory path to list'),
  }),
  execute: async ({ path: dirPath }) => {
    const dir = dirPath || '.';
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .map(e => e.isDirectory() ? `${e.name}/` : e.name)
      .join('\n');
  },
});
