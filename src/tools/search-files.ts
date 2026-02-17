import { defineTool } from '../core/tool.js';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const searchFilesTool = defineTool({
  name: 'search_files',
  description: 'Search for files matching a pattern. Recursively walks directories, skipping node_modules and .git.',
  parameters: z.object({
    pattern: z.string().describe('File name pattern to match (e.g. "*.ts", "test*")'),
    directory: z.string().describe('Root directory to search from'),
    max_results: z.number().describe('Maximum results to return'),
  }),
  execute: async ({ pattern, directory, max_results }) => {
    const dir = directory || '.';
    const limit = max_results || 50;
    const results: string[] = [];
    const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');

    function walk(d: string) {
      if (results.length >= limit) return;
      try {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          if (results.length >= limit) return;
          const fullPath = path.join(d, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
              walk(fullPath);
            }
          } else if (regex.test(entry.name)) {
            results.push(fullPath);
          }
        }
      } catch { /* permission errors */ }
    }

    walk(dir);
    return results.length > 0 ? results.join('\n') : 'No files found matching pattern.';
  },
});
