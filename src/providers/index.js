const ClaudeProvider = require("./claude");
const OpenAIProvider = require("./openai");
const GeminiProvider = require("./gemini");

const PROVIDERS = {
  claude: ClaudeProvider,
  openai: OpenAIProvider,
  gemini: GeminiProvider,
};

function createProvider(name, opts = {}) {
  const Provider = PROVIDERS[name];
  if (!Provider) {
    throw new Error(`Unknown provider "${name}". Available: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  return new Provider(opts);
}

module.exports = { createProvider, ClaudeProvider, OpenAIProvider, GeminiProvider, PROVIDERS };
