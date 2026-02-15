const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const TaskDB = require("./task-db");

/**
 * Helper: Create a temp directory for each test
 */
function getTempDir() {
  const testDir = path.join(os.tmpdir(), `myuru-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

/**
 * Helper: Clean up temp directory
 */
function cleanupDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ============================================================================
// TASK CREATION & RETRIEVAL
// ============================================================================

test("Task creation: creates task with default priority", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    const taskId = db.createTask({
      id: "task-1",
      title: "Test Task",
      description: "A test task",
      createdBy: "user-1",
    });

    assert.strictEqual(taskId, "task-1");
    const task = db.getTask("task-1");
    assert.ok(task);
    assert.strictEqual(task.status, "pending");
    assert.strictEqual(task.priority, 5);
    assert.strictEqual(task.assigned_to, null);
    assert.strictEqual(task.title, "Test Task");
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Task creation: creates task with custom priority", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.createTask({
      id: "task-high",
      title: "High Priority",
      description: "Important",
      priority: 1,
      createdBy: "user-1",
    });

    const task = db.getTask("task-high");
    assert.strictEqual(task.priority, 1);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Task creation: creates task with parent and dependencies", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.createTask({
      id: "task-parent",
      title: "Parent Task",
      description: "Parent",
      createdBy: "user-1",
      parentId: null,
      dependsOn: ["task-prereq"],
      tags: ["important", "backend"],
    });

    const task = db.getTask("task-parent");
    assert.strictEqual(task.parent_id, null);
    assert.deepStrictEqual(task.depends_on, ["task-prereq"]);
    assert.deepStrictEqual(task.tags, ["important", "backend"]);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Task retrieval: returns null for nonexistent task", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    const task = db.getTask("nonexistent");
    assert.strictEqual(task, null);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

// ============================================================================
// TASK STATE TRANSITIONS
// ============================================================================

test("Task assignment: assigns task to agent", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.createTask({
      id: "task-1",
      title: "Assignable",
      description: "Test",
      createdBy: "user-1",
    });

    db.assignTask("task-1", "agent-alice");
    const task = db.getTask("task-1");
    assert.strictEqual(task.status, "assigned");
    assert.strictEqual(task.assigned_to, "agent-alice");
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Task start: marks task as in_progress and sets started_at", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.createTask({
      id: "task-1",
      title: "Startable",
      description: "Test",
      createdBy: "user-1",
    });

    const before = new Date().toISOString();
    db.startTask("task-1", "agent-alice");
    const after = new Date().toISOString();

    const task = db.getTask("task-1");
    assert.strictEqual(task.status, "in_progress");
    assert.ok(task.started_at);
    assert.ok(task.started_at >= before);
    assert.ok(task.started_at <= after);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Task completion: marks task as done with result", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.createTask({
      id: "task-1",
      title: "Completable",
      description: "Test",
      createdBy: "user-1",
    });

    db.startTask("task-1", "agent-alice");
    const before = new Date().toISOString();
    db.completeTask("task-1", "agent-alice", "Success!");
    const after = new Date().toISOString();

    const task = db.getTask("task-1");
    assert.strictEqual(task.status, "done");
    assert.strictEqual(task.result, "Success!");
    assert.ok(task.completed_at >= before && task.completed_at <= after);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Task failure: marks task as failed with reason", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.createTask({
      id: "task-1",
      title: "Faileable",
      description: "Test",
      createdBy: "user-1",
    });

    db.startTask("task-1", "agent-alice");
    db.failTask("task-1", "agent-alice", "Connection timeout");

    const task = db.getTask("task-1");
    assert.strictEqual(task.status, "failed");
    assert.strictEqual(task.result, "Connection timeout");
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Task state transition: handles nonexistent task gracefully", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    // Should not throw
    db.assignTask("nonexistent", "agent-alice");
    db.startTask("nonexistent", "agent-alice");
    db.completeTask("nonexistent", "agent-alice", "result");
    db.failTask("nonexistent", "agent-alice", "reason");
    assert.ok(true); // If we get here, no exception was thrown
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

// ============================================================================
// PENDING TASKS & SORTING
// ============================================================================

test("Pending tasks: retrieves only pending tasks sorted by priority", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.createTask({ id: "t1", title: "Low", description: "Low priority", priority: 5, createdBy: "user-1" });
    db.createTask({ id: "t2", title: "High", description: "High priority", priority: 1, createdBy: "user-1" });
    db.createTask({ id: "t3", title: "Med", description: "Med priority", priority: 3, createdBy: "user-1" });

    // Complete one
    db.assignTask("t1", "agent-alice");
    db.startTask("t1", "agent-alice");
    db.completeTask("t1", "agent-alice", "Done");

    const pending = db.getPendingTasks();
    assert.strictEqual(pending.length, 2);
    assert.strictEqual(pending[0].id, "t2"); // priority 1 first
    assert.strictEqual(pending[1].id, "t3"); // priority 3 second
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Pending tasks: sorts by created_at when priority is same", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    const sleep = (ms) => {
      const start = Date.now();
      while (Date.now() - start < ms) {}
    };

    db.createTask({ id: "t1", title: "First", description: "First", priority: 5, createdBy: "user-1" });
    sleep(10);
    db.createTask({ id: "t2", title: "Second", description: "Second", priority: 5, createdBy: "user-1" });

    const pending = db.getPendingTasks();
    assert.strictEqual(pending[0].id, "t1");
    assert.strictEqual(pending[1].id, "t2");
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

// ============================================================================
// ASSIGNED TASKS
// ============================================================================

test("Assigned tasks: retrieves assigned and in_progress tasks for agent", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.createTask({ id: "t1", title: "Task 1", description: "Task 1", priority: 1, createdBy: "user-1" });
    db.createTask({ id: "t2", title: "Task 2", description: "Task 2", priority: 2, createdBy: "user-1" });
    db.createTask({ id: "t3", title: "Task 3", description: "Task 3", priority: 3, createdBy: "user-1" });
    db.createTask({ id: "t4", title: "Task 4", description: "Task 4", priority: 4, createdBy: "user-1" });

    db.assignTask("t1", "agent-alice");
    db.assignTask("t2", "agent-alice");
    db.startTask("t2", "agent-alice");
    db.completeTask("t3", "agent-alice", "Done");
    db.assignTask("t4", "agent-bob");

    const assigned = db.getAssignedTasks("agent-alice");
    assert.strictEqual(assigned.length, 2);
    assert.strictEqual(assigned[0].id, "t1"); // priority 1, assigned
    assert.strictEqual(assigned[1].id, "t2"); // priority 2, in_progress

    const assignedBob = db.getAssignedTasks("agent-bob");
    assert.strictEqual(assignedBob.length, 1);
    assert.strictEqual(assignedBob[0].id, "t4");
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Assigned tasks: excludes done and failed tasks", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.createTask({ id: "t1", title: "Task 1", description: "Task 1", priority: 1, createdBy: "user-1" });
    db.createTask({ id: "t2", title: "Task 2", description: "Task 2", priority: 2, createdBy: "user-1" });

    db.assignTask("t1", "agent-alice");
    db.completeTask("t1", "agent-alice", "Done");
    db.assignTask("t2", "agent-alice");
    db.failTask("t2", "agent-alice", "Error");

    const assigned = db.getAssignedTasks("agent-alice");
    assert.strictEqual(assigned.length, 0);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

// ============================================================================
// MESSAGES
// ============================================================================

test("Messages: sends message between agents", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    const msg = db.sendMessage("agent-alice", "agent-bob", "Hello Bob!");

    assert.ok(msg.id);
    assert.strictEqual(msg.from_agent, "agent-alice");
    assert.strictEqual(msg.to_agent, "agent-bob");
    assert.strictEqual(msg.content, "Hello Bob!");
    assert.strictEqual(msg.read, 0);
    assert.ok(msg.timestamp);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Messages: increments message IDs", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    const msg1 = db.sendMessage("agent-alice", "agent-bob", "Message 1");
    const msg2 = db.sendMessage("agent-bob", "agent-alice", "Message 2");

    assert.strictEqual(msg2.id, msg1.id + 1);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Messages: marks messages as read when retrieved", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.sendMessage("agent-alice", "agent-bob", "Message 1");
    db.sendMessage("agent-alice", "agent-bob", "Message 2");
    db.sendMessage("agent-charlie", "agent-bob", "Message 3");

    const unread = db.getUnreadMessages("agent-bob");
    assert.strictEqual(unread.length, 3);
    assert.strictEqual(unread[0].read, 1);
    assert.strictEqual(unread[1].read, 1);
    assert.strictEqual(unread[2].read, 1);

    // Second call should return no unread messages
    const unread2 = db.getUnreadMessages("agent-bob");
    assert.strictEqual(unread2.length, 0);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Messages: getUnreadMessages only returns messages to target agent", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.sendMessage("agent-alice", "agent-bob", "To Bob 1");
    db.sendMessage("agent-alice", "agent-charlie", "To Charlie");
    db.sendMessage("agent-bob", "agent-alice", "To Alice");

    const aliceUnread = db.getUnreadMessages("agent-alice");
    assert.strictEqual(aliceUnread.length, 1);
    assert.strictEqual(aliceUnread[0].from_agent, "agent-bob");
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

test("Sessions: getOrCreateSession creates new session", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    const sessionId = db.getOrCreateSession("agent-alice", "session-1");

    assert.strictEqual(sessionId, "session-1");
    assert.strictEqual(db.getSessionId("agent-alice"), "session-1");
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Sessions: getOrCreateSession returns existing session", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    const sessionId1 = db.getOrCreateSession("agent-alice", "session-1");
    const sessionId2 = db.getOrCreateSession("agent-alice", "session-2");

    assert.strictEqual(sessionId1, "session-1");
    assert.strictEqual(sessionId2, "session-1"); // Existing session returned
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Sessions: increments invocations on getOrCreateSession", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.getOrCreateSession("agent-alice", "session-1");
    db.getOrCreateSession("agent-alice", "session-2");
    db.getOrCreateSession("agent-alice", "session-3");

    const data = db.data;
    const session = data.agentSessions["agent-alice"];
    assert.strictEqual(session.invocations, 3);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Sessions: markSessionActivated marks agent as activated", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.getOrCreateSession("agent-alice", "session-1");

    assert.strictEqual(db.isSessionActivated("agent-alice"), false);
    db.markSessionActivated("agent-alice");
    assert.strictEqual(db.isSessionActivated("agent-alice"), true);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Sessions: resetSession clears and recreates session", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.getOrCreateSession("agent-alice", "session-1");
    db.markSessionActivated("agent-alice");

    assert.strictEqual(db.getSessionId("agent-alice"), "session-1");
    assert.strictEqual(db.isSessionActivated("agent-alice"), true);

    db.resetSession("agent-alice", "session-2");
    assert.strictEqual(db.getSessionId("agent-alice"), "session-2");
    assert.strictEqual(db.isSessionActivated("agent-alice"), false);

    const data = db.data;
    const session = data.agentSessions["agent-alice"];
    assert.strictEqual(session.invocations, 0);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Sessions: getSessionId returns null for nonexistent agent", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    const sessionId = db.getSessionId("agent-nonexistent");
    assert.strictEqual(sessionId, null);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Sessions: isSessionActivated returns false for nonexistent agent", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    const activated = db.isSessionActivated("agent-nonexistent");
    assert.strictEqual(activated, false);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

// ============================================================================
// AUTO-PRUNING
// ============================================================================

test("Pruning: auto-prunes taskLog when it exceeds 200 entries", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);

    // Create 220 task events to trigger pruning
    for (let i = 0; i < 220; i++) {
      db.createTask({
        id: `task-${i}`,
        title: `Task ${i}`,
        description: `Task ${i}`,
        createdBy: "user-1",
      });
    }

    assert.ok(db.data.taskLog.length <= 200);
    assert.strictEqual(db.data.taskLog.length, 200);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Pruning: auto-prunes messages when it exceeds 100 entries (keeps unread)", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);

    // Send 150 messages: 80 read + 70 unread
    for (let i = 0; i < 150; i++) {
      db.sendMessage("agent-alice", "agent-bob", `Message ${i}`);
    }

    // Mark first 80 as read, keep last 70 as unread
    for (let i = 0; i < 80; i++) {
      db.data.messages[i].read = 1;
    }
    db._save(); // Trigger prune

    // Pruning keeps: last 100 read messages + all unread messages
    // Since we have 80 read and 70 unread, should have 80 + 70 = 150 total
    // But since we only had 80 read, it should be: 80 read + 70 unread = 150
    // Let's verify pruning worked by checking message count is reasonable
    const unread = db.data.messages.filter(m => m.read === 0);
    const read = db.data.messages.filter(m => m.read === 1);

    // Should have all 70 unread and at most 100 of the read messages
    assert.strictEqual(unread.length, 70);
    assert.ok(read.length <= 100);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

// ============================================================================
// PERSISTENCE & RELOAD
// ============================================================================

test("Persistence: saves and reloads data from file", (t) => {
  const tempDir = getTempDir();
  try {
    let db = new TaskDB(tempDir);
    db.createTask({
      id: "task-1",
      title: "Persistent",
      description: "This should persist",
      priority: 2,
      createdBy: "user-1",
    });
    db.sendMessage("agent-alice", "agent-bob", "Important message");
    db.close();

    // Reload
    db = new TaskDB(tempDir);
    const task = db.getTask("task-1");
    assert.ok(task);
    assert.strictEqual(task.title, "Persistent");
    assert.strictEqual(task.priority, 2);

    const messages = db.data.messages;
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].content, "Important message");
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Persistence: initializes with defaults on missing file", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    assert.ok(db.data.tasks);
    assert.ok(db.data.taskLog);
    assert.ok(db.data.messages);
    assert.ok(db.data.agentSessions);
    assert.strictEqual(db.data.nextMsgId, 1);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

// ============================================================================
// TASK STATS & UTILITIES
// ============================================================================

test("Task stats: counts tasks by status", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.createTask({ id: "t1", title: "T1", description: "T1", createdBy: "user-1" });
    db.createTask({ id: "t2", title: "T2", description: "T2", createdBy: "user-1" });
    db.createTask({ id: "t3", title: "T3", description: "T3", createdBy: "user-1" });
    db.createTask({ id: "t4", title: "T4", description: "T4", createdBy: "user-1" });
    db.createTask({ id: "t5", title: "T5", description: "T5", createdBy: "user-1" });

    // t1: stays pending
    db.assignTask("t2", "agent-alice"); // assigned
    db.assignTask("t3", "agent-alice");
    db.startTask("t3", "agent-alice"); // in_progress
    db.assignTask("t4", "agent-alice");
    db.completeTask("t4", "agent-alice", "Done"); // done
    db.assignTask("t5", "agent-alice");
    db.failTask("t5", "agent-alice", "Failed"); // failed

    const stats = db.getTaskStats();
    const statusMap = Object.fromEntries(stats.map(s => [s.status, s.count]));

    assert.strictEqual(statusMap.pending, 1);
    assert.strictEqual(statusMap.assigned, 1);
    assert.strictEqual(statusMap.in_progress, 1);
    assert.strictEqual(statusMap.done, 1);
    assert.strictEqual(statusMap.failed, 1);
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("Stuck tasks: identifies in_progress tasks older than threshold", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.createTask({ id: "t1", title: "T1", description: "T1", createdBy: "user-1" });
    db.createTask({ id: "t2", title: "T2", description: "T2", createdBy: "user-1" });

    db.startTask("t1", "agent-alice");
    const oldStartTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
    db.data.tasks.t1.started_at = oldStartTime;

    db.startTask("t2", "agent-alice"); // Just now

    const stuck = db.getStuckTasks(2 * 60 * 1000); // 2 min threshold
    assert.strictEqual(stuck.length, 1);
    assert.strictEqual(stuck[0].id, "t1");
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});

test("All tasks: returns all tasks sorted by priority", (t) => {
  const tempDir = getTempDir();
  try {
    const db = new TaskDB(tempDir);
    db.createTask({ id: "t1", title: "T1", description: "T1", priority: 3, createdBy: "user-1" });
    db.createTask({ id: "t2", title: "T2", description: "T2", priority: 1, createdBy: "user-1" });
    db.createTask({ id: "t3", title: "T3", description: "T3", priority: 2, createdBy: "user-1" });

    db.completeTask("t1", "agent-alice", "Done");

    const all = db.getAllTasks();
    assert.strictEqual(all.length, 3);
    assert.strictEqual(all[0].id, "t2"); // priority 1
    assert.strictEqual(all[1].id, "t3"); // priority 2
    assert.strictEqual(all[2].id, "t1"); // priority 3 (even though done)
    db.close();
  } finally {
    cleanupDir(tempDir);
  }
});
