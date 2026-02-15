/**
 * OpenAI provider — uses the OpenAI API via fetch.
 * Requires OPENAI_API_KEY in environment.
 *
 * For v0.1.0: basic chat completions. No session persistence.
 */
class OpenAIProvider {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = opts.baseUrl || "https://api.openai.com/v1";
  }

  static MODELS = {
    "gpt-4o": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
    "gpt-4-turbo": "gpt-4-turbo",
    "o1": "o1",
    "o1-mini": "o1-mini",
  };

  async invoke(prompt, { model = "gpt-4o-mini", systemPrompt = "" } = {}) {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY not set. Run: export OPENAI_API_KEY=sk-...");
    }

    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: OpenAIProvider.MODELS[model] || model,
        messages,
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.choices[0]?.message?.content || "";
  }

  buildCommand() {
    throw new Error("OpenAI provider uses invoke() directly, not buildCommand().");
  }
}

module.exports = OpenAIProvider;
