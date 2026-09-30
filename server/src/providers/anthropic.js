import { postJson } from './http.js';

export const anthropic = {
  id: 'claude',
  label: 'Claude',
  vendor: 'Anthropic',
  get model() { return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'; },
  isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  async ask(prompt, { system, maxTokens = 1024 } = {}) {
    const data = await postJson(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      { model: this.model, max_tokens: maxTokens, ...(system && { system }), messages: [{ role: 'user', content: prompt }] },
      180_000,
    );
    return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  },
};
