const fs = require("fs");
const path = require("path");

/**
 * Claude CLI provider.
 * Wraps `claude -p` with session persistence, model selection, etc.
 */
class ClaudeProvider {
  constructor(opts = {}) {
    this.binary = opts.binary || "claude";
  }

  buildCommand({ model, sessionId, resume, maxTurns, budgetUsd, systemPrompt, promptFile, tmpDir, tempFiles }) {
    const args = ["-p"];

    if (resume) {
      args.push("--resume", sessionId);
    } else {
      args.push("--session-id", sessionId);
    }

    args.push("--model", model);

    if (budgetUsd) {
      args.push("--max-budget-usd", String(budgetUsd));
    }

    if (systemPrompt) {
      const sysFile = path.join(tmpDir, `sysprompt-${Date.now()}.txt`);
      fs.writeFileSync(sysFile, systemPrompt, "utf-8");
      const sysFileWin = sysFile.replace(/\//g, "\\");
      args.push("--system-prompt-file", `"${sysFileWin}"`);
      tempFiles.push(sysFile);
    }

    if (maxTurns) {
      args.push("--max-turns", String(maxTurns));
    }

    args.push("--dangerously-skip-permissions");

    const promptFileWin = promptFile.replace(/\//g, "\\");
    args.push(`< "${promptFileWin}"`);

    return { cmd: this.binary, args, env: {} };
  }
}

module.exports = ClaudeProvider;
