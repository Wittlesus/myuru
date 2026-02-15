const fs = require("fs");
const path = require("path");
const { createProvider } = require("../providers");
const AgentRunner = require("../lib/agent-runner");
const TaskDB = require("../lib/task-db");
const Dashboard = require("../lib/dashboard");
async function run(opts) {
  const cwd = process.cwd();
  const stateDir = path.join(cwd, ".myuru");
  fs.mkdirSync(stateDir, { recursive: true });

  // Load config
  let config = {};
  const configFile = path.join(cwd, "myuru.config.mjs");
  if (fs.existsSync(configFile)) {
    try {
      config = (await import(`file://${configFile.replace(/\\/g, "/")}`)).default;
    } catch {}
  }

  // CLI overrides
  const providerName = opts.provider || config.provider || "claude";
  const model = opts.model || config.model || "sonnet";
  const agentCount = parseInt(opts.agents) || config.agents || 2;
  const budget = opts.budget || config.budget || "5";
  const maxTurns = config.maxTurns || 10;
  const concurrent = opts.concurrent || config.concurrent || false;

  const execMode = concurrent ? "concurrent" : "sequential";
  console.log(`MyUru v0.1.0 | ${providerName}/${model}`);
  console.log(`Agents: ${agentCount} | Execution: ${execMode}`);
  console.log("─".repeat(50));

  // Resolve task
  let task = opts.task;
  if (!task && opts.file) {
    task = fs.readFileSync(opts.file, "utf-8");
  }
  if (!task) {
    console.error("No task specified. Use --task \"...\" or --file <path>");
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log("\nDry run — would execute:");
    console.log(`  Task: ${task}`);
    console.log(`  Provider: ${providerName}/${model}`);
    console.log(`  Agents: ${agentCount}`);
    console.log(`  Budget: $${budget}`);
    return;
  }

  // Create provider and DB
  const provider = createProvider(providerName);
  const db = new TaskDB(stateDir);

  // Create task in DB
  const taskId = `task-${Date.now()}`;
  db.createTask({
    id: taskId,
    title: task.substring(0, 100),
    description: task,
    priority: 1,
    createdBy: "user",
  });

  // Create agents
  const agents = [];
  const roles = config.roles || { Builder: "You are a software engineer. Write clean, working code." };
  const roleNames = Object.keys(roles).slice(0, agentCount);

  for (let i = 0; i < agentCount; i++) {
    const roleName = roleNames[i % roleNames.length];
    agents.push(new AgentRunner({
      id: `${roleName}-${i}`,
      model,
      provider,
      systemPrompt: roles[roleName] || `You are ${roleName}. Complete the task efficiently.`,
      maxTurns,
      budgetUsd: budget,
      cwd,
      stateless: true,
    }));
  }

  // Dashboard
  const dashboard = new Dashboard();
  const startTime = Date.now();

  dashboard.start(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const running = agents.filter(a => a.busy).length;
    const done = agents.filter(a => a.invocationCount > 0 && !a.busy).length;
    return [
      `\x1b[36mMyUru\x1b[0m | ${providerName}/${model} | ${execMode}`,
      `Task: ${task.substring(0, 60)}`,
      `Agents: ${running} running, ${done} done | ${elapsed}s elapsed`,
      "─".repeat(dashboard.cols),
    ];
  });

  // Execute
  console.log(`\nExecuting with ${agentCount} agent(s)...\n`);

  const runAgent = async (agent, idx) => {
    const prompt = [
      `PROJECT DIRECTORY: ${cwd}`,
      `TASK: ${task}`,
      "",
      `You are agent ${idx + 1} of ${agentCount}.`,
      agentCount > 1 ? `Focus on your part. Agent roles: ${roleNames.join(", ")}.` : "",
      "",
      "Complete the task. Be efficient. Ship working code.",
    ].filter(Boolean).join("\n");

    db.assignTask(taskId, agent.id);
    db.startTask(taskId, agent.id);
    dashboard.log(`[${agent.id}] Starting...`);

    try {
      const output = await agent.invoke(prompt, taskId);
      dashboard.log(`[${agent.id}] Done (${output.length} chars)`);
      return { agent: agent.id, success: true, output };
    } catch (err) {
      dashboard.log(`[${agent.id}] Failed: ${err.message}`);
      return { agent: agent.id, success: false, error: err.message };
    }
  };

  let results;
  if (concurrent && agentCount > 1) {
    results = await Promise.all(agents.map((a, i) => runAgent(a, i)));
  } else {
    results = [];
    for (let i = 0; i < agents.length; i++) {
      results.push(await runAgent(agents[i], i));
    }
  }

  dashboard.stop();

  // Summary
  const successes = results.filter(r => r.success).length;
  const failures = results.filter(r => !r.success).length;

  if (successes > 0) {
    db.completeTask(taskId, "orchestrator", `${successes} agents completed`);
  } else {
    db.failTask(taskId, "orchestrator", `All ${failures} agents failed`);
  }

  console.log("\nResults:");
  console.log("─".repeat(50));
  for (const r of results) {
    const icon = r.success ? "OK" : "XX";
    console.log(`  [${icon}] ${r.agent}`);
    if (r.output) console.log(`       ${r.output.substring(0, 200)}`);
    if (r.error) console.log(`       Error: ${r.error}`);
  }
  console.log(`\n${successes} succeeded, ${failures} failed.`);

  db.close();
}

module.exports = { run };
