/**
 * Gemini provider — uses the Google Generative AI API via fetch.
 * Requires GEMINI_API_KEY in environment.
 */
class GeminiProvider {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    this.baseUrl = opts.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  }

  static MODELS = {
    "gemini-2.0-flash": "gemini-2.0-flash",
    "gemini-2.0-pro": "gemini-2.0-pro",
    "gemini-1.5-flash": "gemini-1.5-flash",
    "gemini-1.5-pro": "gemini-1.5-pro",
  };

  async invoke(prompt, { model = "gemini-2.0-flash", systemPrompt = "" } = {}) {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY not set. Run: export GEMINI_API_KEY=...");
    }

    const modelId = GeminiProvider.MODELS[model] || model;
    const url = `${this.baseUrl}/models/${modelId}:generateContent?key=${this.apiKey}`;

    const contents = [];
    if (systemPrompt) {
      contents.push({ role: "user", parts: [{ text: systemPrompt }] });
      contents.push({ role: "model", parts: [{ text: "Understood." }] });
    }
    contents.push({ role: "user", parts: [{ text: prompt }] });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  buildCommand() {
    throw new Error("Gemini provider uses invoke() directly, not buildCommand().");
  }
}

module.exports = GeminiProvider;
