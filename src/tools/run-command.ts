import { defineTool } from '../core/tool.js';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

export const runCommandTool = defineTool({
  name: 'run_command',
  description: 'Execute a shell command and return its output. Times out after 30 seconds by default.',
  parameters: z.object({
    command: z.string().describe('The shell command to execute'),
    cwd: z.string().describe('Working directory for the command').optional(),
    timeout_ms: z.number().describe('Timeout in milliseconds').default(30000),
  }),
  execute: async ({ command, cwd, timeout_ms }) => {
    try {
      // Use the platform shell to execute the command
      const shell = platform() === 'win32' ? 'cmd' : '/bin/sh';
      const shellArg = platform() === 'win32' ? '/c' : '-c';

      const output = execFileSync(shell, [shellArg, command], {
        cwd: cwd ?? process.cwd(),
        timeout: timeout_ms,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return output || '(command produced no output)';
    } catch (err: any) {
      const stderr = err.stderr?.toString() ?? '';
      const stdout = err.stdout?.toString() ?? '';
      return `Exit code: ${err.status ?? 'unknown'}\nStdout: ${stdout}\nStderr: ${stderr}`;
    }
  },
});
