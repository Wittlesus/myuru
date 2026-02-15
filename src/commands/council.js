const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const CouncilServer = require("../lib/council-server");
const { TierManager } = require("../lib/tiers");

async function council(opts) {
  const topic = opts.topic;
  if (!topic) {
    console.error("No topic specified. Use --topic \"...\"");
    process.exit(1);
  }

  const agentNames = (opts.agents || "Architect,Reviewer,Tester").split(",").map(a => a.trim());
  const maxRounds = parseInt(opts.rounds) || 3;
  const shouldExecute = opts.execute || false;

  // Tier check
  const tier = new TierManager("FREE");
  try {
    tier.enforceLimit(agentNames.length);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  console.log("MyUru Council");
  console.log("─".repeat(50));
  console.log(`Topic: ${topic}`);
  console.log(`Agents: ${agentNames.join(", ")}`);
  console.log(`Rounds: ${maxRounds}`);
  console.log("");

  // Start council server
  const server = new CouncilServer();
  const port = await server.start();
  console.log(`Council server on port ${port}`);

  // Configure session
  server.config.agents = agentNames;
  server.config.maxRounds = maxRounds;

  const base = `http://localhost:${port}`;

  // Default role prompts
  const rolePrompts = {
    Architect: "Focus on technical feasibility. Challenge complexity. Push for simplicity.",
    Reviewer: "Focus on code quality and edge cases. Challenge assumptions.",
    Tester: "Focus on testability. What could break? Push for test coverage.",
    Revenue: "Focus on monetization. Challenge anything without revenue path.",
    Growth: "Focus on user acquisition. How do users find this?",
    Security: "Focus on security implications. What attack surfaces exist?",
  };

  // Spawn agents for deliberation
  console.log("\n--- DELIBERATION ---\n");

  const spawnAgent = (name) => {
    const prompt = [
      `You are "${name}" in a council discussion.`,
      `TOPIC: ${topic}`,
      `YOUR ROLE: ${name}. Stay in character. Be concise.`,
      "CHATROOM PROTOCOL:",
      `- Send message: curl -s -X POST ${base}/chat -H "Content-Type: application/json" -d '{"agent":"${name}","message":"YOUR MSG"}'`,
      `- Read messages: curl -s "${base}/chat?since=-1"`,
      `- Keep messages under 300 chars.`,
      `- You have ${maxRounds} rounds. Each round: read, think, respond.`,
      "- Reference other agents by name. Agree, disagree, challenge.",
      "EFFICIENCY RULES:",
      "- One message per round. No essays.",
      "- Agree in 1 sentence + 1 new insight. Disagree in 2-3 sentences max.",
      rolePrompts[name] || `You are ${name}. Contribute your perspective.`,
      `START: Post opening position (2 sentences), then loop for ${maxRounds} rounds.`,
    ].join("\n");

    console.log(`  Spawning ${name}...`);

    const env = { ...process.env };
    delete env.CLAUDECODE;

    // Intentional spawn — core product functionality
    const child = spawn("claude", ["--model", "haiku", "-p"], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      shell: true,
    });

    child.stdin.write(prompt);
    child.stdin.end();

    let output = "";
    child.stdout?.on("data", d => output += d.toString());
    child.stderr?.on("data", d => output += d.toString());

    return new Promise(resolve => {
      child.on("close", code => {
        console.log(`  ${name} finished (exit ${code})`);
        resolve({ name, code, output: output.substring(0, 500) });
      });
      child.on("error", () => {
        resolve({ name, code: -1, output: "spawn error" });
      });
    });
  };

  const results = await Promise.all(agentNames.map(spawnAgent));

  // Get transcript
  const transcript = server.messages
    .map(m => `[R${m.round}] **${m.agent}**: ${m.message}`)
    .join("\n\n");

  console.log(`\nDeliberation complete: ${server.messages.length} messages across ${server.currentRound} rounds.\n`);

  if (transcript) {
    console.log("--- TRANSCRIPT ---\n");
    console.log(transcript.substring(0, 3000));
    console.log("");
  }

  // Task extraction
  if (shouldExecute && server.messages.length > 0) {
    console.log("--- TASK EXTRACTION ---\n");

    const extractPrompt = [
      "Read this council debate and extract 3-6 concrete tasks.",
      `Output a JSON array: [{id, title, description, assignee, priority}].`,
      `Assignee must be one of: ${agentNames.join(", ")}.`,
      "Only output the JSON array.",
      "",
      "TRANSCRIPT:",
      transcript.substring(0, 4000),
    ].join("\n");

    const env = { ...process.env };
    delete env.CLAUDECODE;

    const taskOutput = await new Promise(resolve => {
      const child = spawn("claude", ["--model", "haiku", "-p"], {
        stdio: ["pipe", "pipe", "pipe"], env, shell: true,
      });
      child.stdin.write(extractPrompt);
      child.stdin.end();
      let out = "";
      child.stdout?.on("data", d => out += d.toString());
      child.stderr?.on("data", d => out += d.toString());
      child.on("close", () => resolve(out));
    });

    let tasks = [];
    try {
      const jsonMatch = taskOutput.match(/\[[\s\S]*\]/);
      tasks = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      console.log("Failed to parse tasks from output.");
    }

    if (tasks.length > 0) {
      console.log(`Extracted ${tasks.length} tasks:`);
      tasks.forEach(t => console.log(`  [${t.assignee}] ${t.title}`));
    }
  }

  await server.stop();
  console.log("\nCouncil session complete.");
}

module.exports = { council };
