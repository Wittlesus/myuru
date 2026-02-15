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
| `myuru council --topic "..." --agents "..."` | Start council deliberation |
| `myuru status` | View task progress |

## Configuration

Set environment variables:

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GOOGLE_API_KEY="..."
```

Create `.myuru.json`:

```json
{
  "tier": "free",
  "providers": ["claude", "openai"],
  "maxConcurrent": 2
}
```

## Requirements

- Node.js >= 18
- Claude CLI (for Claude provider)
- API keys for your chosen providers

## License

MIT - See LICENSE file

---

Built by Wittlesus | [GitHub](https://github.com/Wittlesus/myuru)
