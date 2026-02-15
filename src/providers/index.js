const ClaudeProvider = require("./claude");
const OpenAIProvider = require("./openai");

const PROVIDERS = {
  claude: ClaudeProvider,
  openai: OpenAIProvider,
};

function createProvider(name, opts = {}) {
  const Provider = PROVIDERS[name];
  if (!Provider) {
    throw new Error(`Unknown provider "${name}". Available: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  return new Provider(opts);
}

module.exports = { createProvider, ClaudeProvider, OpenAIProvider, PROVIDERS };
