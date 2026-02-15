const fs = require("fs");
const path = require("path");
const TaskDB = require("../lib/task-db");

async function status() {
  const stateDir = path.join(process.cwd(), ".myuru");

  if (!fs.existsSync(stateDir)) {
    console.log("No MyUru project found. Run: myuru init");
    return;
  }

  const db = new TaskDB(stateDir);
  const tasks = db.getAllTasks();
  const stats = db.getTaskStats();

  if (tasks.length === 0) {
    console.log("No tasks yet. Run: myuru run --task \"...\"");
    return;
  }

  console.log("MyUru Task Status");
  console.log("─".repeat(60));

  const statusIcons = {
    pending: "  ",
    assigned: ">>",
    in_progress: "**",
    done: "OK",
    failed: "XX",
  };

  for (const task of tasks) {
    const icon = statusIcons[task.status] || "??";
    const agent = task.assigned_to ? ` (${task.assigned_to})` : "";
    console.log(`  [${icon}] ${task.title}${agent}`);
    if (task.result) {
      console.log(`       -> ${task.result.substring(0, 80)}`);
    }
  }

  console.log("");
  console.log("Summary:");
  for (const s of stats) {
    console.log(`  ${s.status}: ${s.count}`);
  }
}

module.exports = { status };
