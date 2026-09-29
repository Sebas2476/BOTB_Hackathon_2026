import { anthropic } from './anthropic.js';
import { openai } from './openai.js';
import { gemini } from './gemini.js';
import { copilot } from './copilot.js';
import { simulateAnswer } from './simulator.js';

export const PROVIDERS = [anthropic, openai, gemini, copilot];

export function describeProviders() {
  return PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    vendor: p.vendor,
    model: p.isConfigured() ? p.model : 'simulated',
    live: p.isConfigured(),
  }));
}

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id);
}

// Returns { text, live } — falls back to the simulator when no key is configured.
export async function askModel(providerId, prompt, product) {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown model: ${providerId}`);
  if (!provider.isConfigured()) {
    return { text: simulateAnswer(providerId, prompt, product), live: false };
  }
  return { text: await provider.ask(prompt), live: true };
}
