import { postJson } from './http.js';

export const anthropic = {
  id: 'claude',
  label: 'Claude',
  vendor: 'Anthropic',
  get model() { return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'; },
  isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  async ask(prompt) {
    const data = await postJson(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      { model: this.model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] },
    );
    return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  },
};
