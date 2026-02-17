import { defineTool } from '../core/tool.js';
import { z } from 'zod';
import * as fs from 'node:fs';

export const editFileTool = defineTool({
  name: 'edit_file',
  description: 'Edit a file by replacing an exact string match with new content. The old_string must match exactly (including whitespace/indentation). Must be unique in the file.',
  parameters: z.object({
    path: z.string().describe('Path to the file to edit'),
    old_string: z.string().describe('The exact string to find and replace'),
    new_string: z.string().describe('The replacement string'),
  }),
  execute: async ({ path: filePath, old_string, new_string }) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.includes(old_string)) {
      return `Error: old_string not found in ${filePath}. Make sure the string matches exactly including whitespace.`;
    }
    const occurrences = content.split(old_string).length - 1;
    if (occurrences > 1) {
      return `Error: old_string found ${occurrences} times in ${filePath}. It must be unique — include more surrounding context.`;
    }
    const updated = content.replace(old_string, new_string);
    fs.writeFileSync(filePath, updated, 'utf-8');
    return `Edited ${filePath}: replaced ${old_string.length} chars with ${new_string.length} chars`;
  },
});
