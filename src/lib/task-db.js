const fs = require("fs");
const path = require("path");

/**
 * JSON-file task database.
 * Persists tasks, messages, and agent sessions to disk.
 * Single-process safe. Atomic writes via tmp+rename.
 */
class TaskDB {
  constructor(stateDir) {
    this.stateDir = stateDir;
    this.dbFile = path.join(stateDir, "myuru-db.json");
    fs.mkdirSync(stateDir, { recursive: true });
    this.data = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.dbFile, "utf-8"));
    } catch {
      return {
        tasks: {},
        taskLog: [],
        messages: [],
        agentSessions: {},
        nextMsgId: 1,
      };
    }
  }

  _save() {
    this._prune();
    const tmp = this.dbFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    for (let i = 0; i < 3; i++) {
      try {
        fs.renameSync(tmp, this.dbFile);
        return;
      } catch (e) {
        if (i === 2) throw e;
        const start = Date.now();
        while (Date.now() - start < (i + 1) * 20) {}
      }
    }
  }

  _prune() {
    if (this.data.taskLog.length > 200) {
      this.data.taskLog = this.data.taskLog.slice(-200);
    }
    if (this.data.messages.length > 100) {
      const unread = this.data.messages.filter(m => m.read === 0);
      const read = this.data.messages.filter(m => m.read === 1);
      this.data.messages = [...read.slice(-100), ...unread];
    }
  }

  // -- Tasks --

  createTask({ id, title, description, priority = 5, createdBy, parentId = null, dependsOn = null, tags = null }) {
    const now = new Date().toISOString();
    this.data.tasks[id] = {
      id, title, description,
      status: "pending", priority,
      assigned_to: null, created_by: createdBy,
      created_at: now, started_at: null, completed_at: null,
      result: null, parent_id: parentId, depends_on: dependsOn, tags,
    };
    this._logEvent(id, createdBy, "created", title);
    this._save();
    return id;
  }

  assignTask(taskId, agentId) {
    const task = this.data.tasks[taskId];
    if (!task) return;
    task.status = "assigned";
    task.assigned_to = agentId;
    this._logEvent(taskId, agentId, "assigned", `Assigned to ${agentId}`);
    this._save();
  }

  startTask(taskId, agentId) {
    const task = this.data.tasks[taskId];
    if (!task) return;
    task.status = "in_progress";
    task.started_at = new Date().toISOString();
    this._logEvent(taskId, agentId, "started", null);
    this._save();
  }

  completeTask(taskId, agentId, result) {
    const task = this.data.tasks[taskId];
    if (!task) return;
    task.status = "done";
    task.completed_at = new Date().toISOString();
    task.result = result;
    this._logEvent(taskId, agentId, "completed", result);
    this._save();
  }

  failTask(taskId, agentId, reason) {
    const task = this.data.tasks[taskId];
    if (!task) return;
    task.status = "failed";
    task.completed_at = new Date().toISOString();
    task.result = reason;
    this._logEvent(taskId, agentId, "failed", reason);
    this._save();
  }

  getTask(taskId) { return this.data.tasks[taskId] || null; }

  getPendingTasks() {
    return Object.values(this.data.tasks)
      .filter(t => t.status === "pending")
      .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
  }

  getAssignedTasks(agentId) {
    return Object.values(this.data.tasks)
      .filter(t => t.assigned_to === agentId && ["assigned", "in_progress"].includes(t.status))
      .sort((a, b) => a.priority - b.priority);
  }

  getAllTasks() {
    return Object.values(this.data.tasks)
      .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
  }

  getTaskStats() {
    const counts = {};
    for (const task of Object.values(this.data.tasks)) {
      counts[task.status] = (counts[task.status] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }

  getStuckTasks(thresholdMs) {
    const cutoff = new Date(Date.now() - thresholdMs).toISOString();
    return Object.values(this.data.tasks)
      .filter(t => t.status === "in_progress" && t.started_at && t.started_at < cutoff);
  }

  // -- Messages --

  sendMessage(fromAgent, toAgent, content) {
    const msg = {
      id: this.data.nextMsgId++,
      from_agent: fromAgent, to_agent: toAgent,
      timestamp: new Date().toISOString(), content, read: 0,
    };
    this.data.messages.push(msg);
    this._save();
    return msg;
  }

  getUnreadMessages(agentId) {
    const msgs = this.data.messages.filter(m => m.to_agent === agentId && m.read === 0);
    for (const m of msgs) m.read = 1;
    if (msgs.length > 0) this._save();
    return msgs;
  }

  // -- Sessions --

  getOrCreateSession(agentId, sessionId) {
    const existing = this.data.agentSessions[agentId];
    if (existing) {
      existing.lastUsed = new Date().toISOString();
      existing.invocations++;
      this._save();
      return existing.sessionId;
    }
    this.data.agentSessions[agentId] = {
      sessionId, createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(), invocations: 1, activated: false,
    };
    this._save();
    return sessionId;
  }

  markSessionActivated(agentId) {
    const entry = this.data.agentSessions[agentId];
    if (entry) { entry.activated = true; this._save(); }
  }

  resetSession(agentId, newSessionId) {
    this.data.agentSessions[agentId] = {
      sessionId: newSessionId, createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(), invocations: 0, activated: false,
    };
    this._save();
  }

  isSessionActivated(agentId) {
    const entry = this.data.agentSessions[agentId];
    return entry ? !!entry.activated : false;
  }

  getSessionId(agentId) {
    const entry = this.data.agentSessions[agentId];
    return entry ? entry.sessionId : null;
  }

  // -- Internal --

  _logEvent(taskId, agentId, event, detail) {
    this.data.taskLog.push({
      task_id: taskId, agent_id: agentId,
      timestamp: new Date().toISOString(), event, detail,
    });
  }

  close() { this._save(); }
}

module.exports = TaskDB;
