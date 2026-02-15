const fs = require("fs");
const path = require("path");

async function init(opts) {
  const cwd = process.cwd();
  const configFile = path.join(cwd, "myuru.config.mjs");
  const stateDir = path.join(cwd, ".myuru");

  if (fs.existsSync(configFile)) {
    console.log("myuru.config.mjs already exists in this directory.");
    return;
  }

  // Create .myuru state directory
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, ".gitignore"), "*\n");

  // Write default config
  const template = opts.template || "default";
  const config = getTemplate(template);
  fs.writeFileSync(configFile, config);

  console.log("Initialized MyUru project:");
  console.log(`  ${configFile}`);
  console.log(`  ${stateDir}/`);
  console.log("");
  console.log("Next: myuru run --task \"Build a login page\"");
}

function getTemplate(name) {
  const templates = {
    default: `// myuru.config.mjs — MyUru orchestrator configuration
export default {
  // Provider: "claude", "openai", or "gemini" (coming soon)
  provider: "claude",

  // Model to use for execution
  model: "sonnet",

  // Number of builder agents
  agents: 2,

  // Agent roles and system prompts
  roles: {
    Builder: "You are a software engineer. Write clean, working code.",
    Reviewer: "You review code for bugs, security issues, and quality.",
  },

  // Budget limit per run (USD)
  budget: 5,

  // Max turns per agent invocation
  maxTurns: 10,
};
`,
    minimal: `export default {
  provider: "claude",
  model: "sonnet",
  agents: 1,
};
`,
  };

  return templates[name] || templates.default;
}

module.exports = { init };
