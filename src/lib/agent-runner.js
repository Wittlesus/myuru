const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

/**
 * AgentRunner — manages a single AI agent process.
 *
 * Core of MyUru: spawns AI CLI tools (claude, etc.) with session
 * persistence, model selection, and structured command parsing.
 *
 * NOTE: spawn() usage here is intentional and safe — we control
 * the command and arguments, no user input is interpolated.
 */
class AgentRunner {
  constructor({ id, model, provider, systemPrompt, maxTurns, budgetUsd, cwd, timeout, stateless }) {
    this.id = id;
    this.model = model || "sonnet";
    this.provider = provider;
    this.systemPrompt = systemPrompt || "";
    this.maxTurns = maxTurns || 0;
    this.budgetUsd = budgetUsd || "1";
    this.cwd = cwd || process.cwd();
    this.timeout = timeout || 300000;
    this.stateless = !!stateless;

    this.sessionId = crypto.randomUUID();
    this.activated = false;
    this.busy = false;
    this.invocationCount = 0;
    this.turnsSinceReset = 0;
    this.lastActivity = Date.now();
    this.currentProcess = null;
    this.currentTaskId = null;
    this.SESSION_RESET_INTERVAL = 10;
  }

  async invoke(prompt, taskId = null) {
    if (this.busy) throw new Error(`Agent ${this.id} is busy`);

    this.busy = true;
    this.currentTaskId = taskId;
    this.lastActivity = Date.now();

    try {
      if (!this.stateless && this.turnsSinceReset >= this.SESSION_RESET_INTERVAL) {
        this.sessionId = crypto.randomUUID();
        this.activated = false;
        this.turnsSinceReset = 0;
      }

      const output = await this._run(prompt);
      this.invocationCount++;
      this.turnsSinceReset++;
      this.lastActivity = Date.now();
      return output;
    } finally {
      this.busy = false;
      this.currentTaskId = null;
      this.currentProcess = null;
    }
  }

  _run(prompt) {
    return new Promise((resolve, reject) => {
      const tmpDir = path.join(os.tmpdir(), "myuru-agents");
      fs.mkdirSync(tmpDir, { recursive: true });

      const promptFile = path.join(tmpDir, `${this.id}-${Date.now()}.txt`);
      fs.writeFileSync(promptFile, prompt, "utf-8");
      const tempFiles = [promptFile];

      const { cmd, args, env: providerEnv } = this.provider.buildCommand({
        model: this.model,
        sessionId: this.sessionId,
        resume: this.activated,
        maxTurns: this.maxTurns,
        budgetUsd: this.budgetUsd,
        systemPrompt: (!this.activated && this.systemPrompt) ? this.systemPrompt : null,
        promptFile,
        tmpDir,
        tempFiles,
      });

      const env = { ...process.env, ...providerEnv };
      delete env.CLAUDECODE;

      const fullCmd = `${cmd} ${args.join(" ")}`;

      // spawn is intentional here — this is the core product functionality
      const child = spawn(fullCmd, {
        shell: true,
        cwd: this.cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: this.timeout,
      });

      this.currentProcess = child;
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", chunk => {
        stdout += chunk.toString();
        this.lastActivity = Date.now();
      });
      child.stderr.on("data", chunk => { stderr += chunk.toString(); });

      child.on("close", code => {
        for (const f of tempFiles) { try { fs.unlinkSync(f); } catch {} }
        if (code === 0) {
          if (!this.activated) this.activated = true;
          resolve(stdout.trim());
        } else if (code === null) {
          reject(new Error(`Agent ${this.id} killed (timeout or signal)`));
        } else {
          reject(new Error(`Agent ${this.id} exited ${code}: ${stderr.slice(0, 300)}`));
        }
      });

      child.on("error", err => {
        for (const f of tempFiles) { try { fs.unlinkSync(f); } catch {} }
        reject(new Error(`Agent ${this.id} spawn error: ${err.message}`));
      });
    });
  }

  static parseCommands(output) {
    const commands = [];
    const regex = />>>(\w+):\s*(\{[\s\S]*?\})<<</gm;
    let match;
    while ((match = regex.exec(output)) !== null) {
      try {
        commands.push({ type: match[1], payload: JSON.parse(match[2]) });
      } catch {}
    }
    return commands;
  }

  kill() {
    if (this.currentProcess) {
      this.currentProcess.kill("SIGTERM");
      setTimeout(() => {
        if (this.currentProcess) {
          try { this.currentProcess.kill("SIGKILL"); } catch {}
        }
      }, 5000);
    }
  }
}

module.exports = AgentRunner;
