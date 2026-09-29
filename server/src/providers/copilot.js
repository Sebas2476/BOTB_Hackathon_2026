import { postJson } from './http.js';

// Microsoft Copilot has no public consumer API. When an Azure OpenAI deployment
// is configured we use it as the closest proxy; otherwise Copilot is simulated.
export const copilot = {
  id: 'copilot',
  label: 'Copilot',
  vendor: 'Microsoft',
  get model() { return process.env.AZURE_OPENAI_DEPLOYMENT || 'azure-openai'; },
  isConfigured: () => Boolean(
    process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT,
  ),
  async ask(prompt) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/+$/, '');
    const version = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
    const data = await postJson(
      `${endpoint}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${version}`,
      { 'api-key': process.env.AZURE_OPENAI_API_KEY },
      { messages: [{ role: 'user', content: prompt }] },
    );
    return data.choices?.[0]?.message?.content ?? '';
  },
};
