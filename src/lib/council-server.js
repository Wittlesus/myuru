const http = require("http");

/**
 * Council chatroom server.
 * Agents connect via HTTP to deliberate, then execute tasks.
 * Phases: deliberate -> assign -> execute -> review -> done
 */
class CouncilServer {
  constructor(port = 3847) {
    this.port = port;
    this.messages = [];
    this.nextId = 0;
    this.phase = "deliberate";
    this.config = { maxRounds: 5, agents: [], tasksAssigned: [] };
    this.currentRound = 0;
    this.roundPosts = new Map();
    this.waitingClients = [];
    this.server = null;
  }

  start() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this._handle(req, res));
      this.server.listen(this.port, () => resolve(this.port));
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        // Release any waiting clients
        this.waitingClients.forEach(({ res }) => {
          try { res.end(JSON.stringify({ shutdown: true })); } catch {}
        });
        this.waitingClients.length = 0;
        this.server.close(resolve);
      } else {
        resolve();
      }
    });
  }

  reset() {
    this.messages = [];
    this.nextId = 0;
    this.currentRound = 0;
    this.phase = "deliberate";
    this.roundPosts.clear();
    this.waitingClients.length = 0;
    this.config.tasksAssigned = [];
  }

  _handle(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    const url = new URL(req.url, "http://localhost");

    if (req.method === "POST" && url.pathname === "/config") {
      return this._readBody(req, res, (body) => {
        Object.assign(this.config, body);
        this.phase = "deliberate";
        this.currentRound = 0;
        this.roundPosts.clear();
        res.end(JSON.stringify({ status: "configured", config: this.config }));
      });
    }

    if (req.method === "POST" && url.pathname === "/chat") {
      return this._readBody(req, res, (body) => {
        const entry = {
          id: this.nextId++, agent: body.agent,
          message: body.message, type: body.type || "chat",
          round: this.currentRound, phase: this.phase, timestamp: Date.now(),
        };
        this.messages.push(entry);

        if (!this.roundPosts.has(this.currentRound)) this.roundPosts.set(this.currentRound, new Set());
        this.roundPosts.get(this.currentRound).add(body.agent);

        res.end(JSON.stringify(entry));
        this._checkBarrier();
      });
    }

    if (req.method === "GET" && url.pathname === "/chat") {
      const since = parseInt(url.searchParams.get("since") || "-1");
      const filtered = this.messages.filter(m => m.id > since);
      res.end(JSON.stringify({ messages: filtered, round: this.currentRound, phase: this.phase }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/chat/wait") {
      const waitRound = parseInt(url.searchParams.get("round") || this.currentRound);
      if (waitRound < this.currentRound) {
        const roundMsgs = this.messages.filter(m => m.round === waitRound);
        res.end(JSON.stringify({ round: this.currentRound, messages: roundMsgs, phase: this.phase }));
        return;
      }
      this.waitingClients.push({ res, round: waitRound });
      setTimeout(() => {
        const idx = this.waitingClients.findIndex(w => w.res === res);
        if (idx >= 0) {
          this.waitingClients.splice(idx, 1);
          res.end(JSON.stringify({ round: this.currentRound, messages: [], phase: this.phase, timeout: true }));
        }
      }, 60000);
      return;
    }

    if (req.method === "POST" && url.pathname === "/tasks") {
      return this._readBody(req, res, (body) => {
        this.config.tasksAssigned = body.tasks;
        this.phase = "execute";
        res.end(JSON.stringify({ status: "assigned", tasks: body.tasks }));
      });
    }

    if (req.method === "GET" && url.pathname === "/tasks") {
      const agent = url.searchParams.get("agent");
      const tasks = agent
        ? this.config.tasksAssigned.filter(t => t.assignee === agent)
        : this.config.tasksAssigned;
      res.end(JSON.stringify({ tasks, phase: this.phase }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/tasks/complete") {
      return this._readBody(req, res, (body) => {
        const task = this.config.tasksAssigned.find(t => t.id === body.taskId);
        if (task) { task.status = "complete"; task.result = body.result; }
        const allDone = this.config.tasksAssigned.every(t => t.status === "complete");
        if (allDone) this.phase = "review";
        res.end(JSON.stringify({ status: "completed", allDone, phase: this.phase }));
      });
    }

    if (req.method === "GET" && url.pathname === "/status") {
      res.end(JSON.stringify({
        phase: this.phase, currentRound: this.currentRound,
        maxRounds: this.config.maxRounds, agents: this.config.agents,
        messageCount: this.messages.length,
        tasksAssigned: this.config.tasksAssigned.length,
        tasksComplete: this.config.tasksAssigned.filter(t => t.status === "complete").length,
      }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/transcript") {
      const transcript = this.messages.map(m => `[R${m.round}] **${m.agent}**: ${m.message}`).join("\n\n");
      res.end(JSON.stringify({ count: this.messages.length, phase: this.phase, transcript }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/reset") {
      this.reset();
      res.end(JSON.stringify({ status: "reset" }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
  }

  _readBody(req, res, cb) {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try { cb(JSON.parse(body)); } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  }

  _checkBarrier() {
    if (this.config.agents.length === 0) return;
    const posted = this.roundPosts.get(this.currentRound) || new Set();
    if (posted.size >= this.config.agents.length) {
      this.currentRound++;
      const roundMsgs = this.messages.filter(m => m.round === this.currentRound - 1);
      this.waitingClients.forEach(({ res }) => {
        res.end(JSON.stringify({ round: this.currentRound, messages: roundMsgs, phase: this.phase }));
      });
      this.waitingClients.length = 0;
      if (this.currentRound >= this.config.maxRounds && this.phase === "deliberate") {
        this.phase = "assign";
      }
    }
  }
}

module.exports = CouncilServer;
