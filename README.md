# MyUru

[![npm version](https://img.shields.io/npm/v/myuru.svg)](https://www.npmjs.com/package/myuru)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Multi-provider AI agent orchestrator. Coordinate Claude, GPT, and Gemini agents to build software in parallel.

## Features

- **Multi-Provider**: Claude, OpenAI, Gemini
- **Council Mode**: Agents deliberate in a chatroom, then execute tasks together
- **Session Persistence**: Agents maintain context across invocations
- **Terminal Dashboard**: Real-time ANSI UI showing agent status
- **Concurrent Execution**: Run agents in parallel or sequentially

## Installation

```bash
npm install -g myuru
```

## Quick Start

Initialize a project:

```bash
myuru init
```

Run agents on a task:

```bash
myuru run --task "Build a login page with JWT auth"
```

Output:
```
[Agent Architect] Designing authentication system...
[Agent Frontend] Building React login form...
[Agent Security] Implementing JWT validation...

Tasks completed: 3/3 | Status: SUCCESS
```

Start a council discussion:

```bash
myuru council \
  --topic "Design auth system" \
  --agents "Architect,Security,Frontend"
```

Check task progress:

```bash
myuru status
```

## Commands

| Command | Description |
|---------|-------------|
| `myuru init` | Initialize project with config |
| `myuru run --task "..."` | Run agents on a task |
| `myuru council --topic "..." --agents "..." --model sonnet` | Start council deliberation |
| `myuru status` | View task progress |

## Configuration

Set environment variables:

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GEMINI_API_KEY="..."
```

Create `myuru.config.mjs`:

```js
export default {
  provider: "claude",
  model: "sonnet",
  agents: 2,
  concurrent: false,
  roles: {
    Builder: "You are a software engineer. Write clean, working code.",
    Reviewer: "You review code for bugs, security issues, and quality.",
  },
};
```

## Requirements

- Node.js >= 18
- Claude CLI (for Claude provider)
- API keys for your chosen providers

## Related Tools

- **[RulesForge](https://github.com/Wittlesus/rulesforge)** — Auto-generate AI coding rules for any codebase
- **[DepScope](https://github.com/Wittlesus/depscope)** — Check npm dependency health scores
- **[ScopeGuard](https://github.com/Wittlesus/scopeguard)** — Prevent AI scope creep with session tracking
- **[mcp-shipkit](https://github.com/Wittlesus/mcp-shipkit)** — Scaffold MCP servers for Claude Desktop in minutes

## License

MIT - See LICENSE file

---

Built by [@WSDevGuy](https://x.com/WSDevGuy) | [GitHub](https://github.com/Wittlesus/myuru)
