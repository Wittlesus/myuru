import { defineTool } from '../core/tool.js';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const searchContentTool = defineTool({
  name: 'search_content',
  description: 'Search file contents for a text pattern (like grep). Returns matching lines with file paths and line numbers.',
  parameters: z.object({
    pattern: z.string().describe('Text or regex pattern to search for'),
    directory: z.string().describe('Directory to search in'),
    file_pattern: z.string().describe('Only search files matching this pattern (e.g. "*.ts")').optional(),
    max_results: z.number().describe('Maximum matching lines to return'),
  }),
  execute: async ({ pattern, directory, file_pattern, max_results }) => {
    const dir = directory || '.';
    const limit = max_results || 30;
    const regex = new RegExp(pattern, 'i');
    const fileRegex = file_pattern
      ? new RegExp('^' + file_pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$')
      : null;
    const matches: string[] = [];

    function walk(d: string) {
      if (matches.length >= limit) return;
      try {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          if (matches.length >= limit) return;
          const fullPath = path.join(d, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') walk(fullPath);
          } else {
            if (fileRegex && !fileRegex.test(entry.name)) continue;
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              for (const [i, line] of content.split('\n').entries()) {
                if (matches.length >= limit) break;
                if (regex.test(line)) {
                  matches.push(`${fullPath}:${i + 1}: ${line.trim()}`);
                }
              }
            } catch { /* binary files */ }
          }
        }
      } catch { /* permission errors */ }
    }

    walk(dir);
    return matches.length > 0 ? matches.join('\n') : 'No matches found.';
  },
});
