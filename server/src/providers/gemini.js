import { postJson } from './http.js';

export const gemini = {
  id: 'gemini',
  label: 'Gemini',
  vendor: 'Google',
  get model() { return process.env.GEMINI_MODEL || 'gemini-2.5-flash'; },
  isConfigured: () => Boolean(process.env.GEMINI_API_KEY),
  async ask(prompt) {
    const data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      { 'x-goog-api-key': process.env.GEMINI_API_KEY },
      { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
    );
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  },
};
