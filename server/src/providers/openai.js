import { postJson } from './http.js';

export const openai = {
  id: 'chatgpt',
  label: 'ChatGPT',
  vendor: 'OpenAI',
  get model() { return process.env.OPENAI_MODEL || 'gpt-5-mini'; },
  isConfigured: () => Boolean(process.env.OPENAI_API_KEY),
  async ask(prompt) {
    const data = await postJson(
      'https://api.openai.com/v1/chat/completions',
      { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      { model: this.model, messages: [{ role: 'user', content: prompt }] },
    );
    return data.choices?.[0]?.message?.content ?? '';
  },
};
