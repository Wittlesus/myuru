export { readFileTool } from './read-file.js';
export { writeFileTool } from './write-file.js';
export { editFileTool } from './edit-file.js';
export { listDirectoryTool } from './list-directory.js';
export { searchFilesTool } from './search-files.js';
export { searchContentTool } from './search-content.js';
export { runCommandTool } from './run-command.js';

import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { editFileTool } from './edit-file.js';
import { listDirectoryTool } from './list-directory.js';
import { searchFilesTool } from './search-files.js';
import { searchContentTool } from './search-content.js';
import { runCommandTool } from './run-command.js';
import type { NamedTool } from '../core/tool.js';

/** All built-in tools as an array, ready for Agent.create() */
export const builtinTools: NamedTool[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  listDirectoryTool,
  searchFilesTool,
  searchContentTool,
  runCommandTool,
];
