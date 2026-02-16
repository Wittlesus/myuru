import * as fs from 'node:fs';
import * as path from 'node:path';

export async function initCommand(opts: { dir: string }): Promise<void> {
  const dir = path.resolve(opts.dir);

  console.log(`\nMyUru v2 — Initializing project in ${dir}\n`);

  // Create config file
  const configPath = path.join(dir, 'myuru.config.ts');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, CONFIG_TEMPLATE);
    console.log('  Created myuru.config.ts');
  } else {
    console.log('  myuru.config.ts already exists, skipping');
  }

  // Create agents directory
  const agentsDir = path.join(dir, 'agents');
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'researcher.ts'),
      AGENT_TEMPLATE,
    );
    console.log('  Created agents/researcher.ts');
  }

  // Create .myuru directory for state
  const stateDir = path.join(dir, '.myuru');
  fs.mkdirSync(stateDir, { recursive: true });
  console.log('  Created .myuru/ (state directory)');

  // Add to .gitignore if it exists
  const gitignorePath = path.join(dir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('.myuru')) {
      fs.appendFileSync(gitignorePath, '\n# MyUru state\n.myuru/\n');
      console.log('  Added .myuru/ to .gitignore');
    }
  }

  console.log('\nDone! Next steps:');
  console.log('  1. Set your API key: export ANTHROPIC_API_KEY=sk-ant-...');
  console.log('  2. Edit myuru.config.ts to configure your agents');
  console.log('  3. Run: myuru run --task "Your task here"\n');
}

const CONFIG_TEMPLATE = `import { type AgentConfig } from 'myuru';

// MyUru Configuration
// Docs: https://github.com/Wittlesus/myuru

export default {
  // Default provider and model
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',

  // Agent definitions
  agents: {
    default: {
      name: 'default',
      instructions: 'You are a helpful AI assistant. Complete tasks efficiently.',
      maxSteps: 10,
    },
  },

  // Pipeline definitions (optional)
  pipelines: {},

  // Tracing
  trace: false,

  // Budget limits (optional)
  budget: {
    maxPerRun: 5.00,
  },
};
`;

const AGENT_TEMPLATE = `import { Agent, defineTool, z } from 'myuru';

// Example agent definition
// Import your provider:
// import { anthropic } from '@ai-sdk/anthropic';

// const researcher = new Agent({
//   name: 'researcher',
//   model: anthropic('claude-sonnet-4-5'),
//   instructions: 'You are a research assistant. Find accurate information.',
//   tools: {},
//   maxSteps: 10,
// });
//
// export default researcher;
`;
