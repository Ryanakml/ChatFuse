export interface PromptTemplate {
  id: string;
  version: string; // e.g., '1.0.0'
  content: string;
}

const registry: Record<string, PromptTemplate[]> = {};

function parseVersion(v: string) {
  const parts = v.split('.').map(Number);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

function compareSemver(v1: string, v2: string) {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);
  if (p1.major !== p2.major) return p1.major - p2.major;
  if (p1.minor !== p2.minor) return p1.minor - p2.minor;
  return p1.patch - p2.patch;
}

export function registerPrompt(prompt: PromptTemplate): void {
  const existingPrompts = registry[prompt.id] || [];
  registry[prompt.id] = existingPrompts;

  const existing = existingPrompts.find((p) => p.version === prompt.version);
  if (existing) {
    throw new Error(`Prompt ${prompt.id} version ${prompt.version} already registered.`);
  }

  existingPrompts.push(prompt);
  // Sort descending so [0] is latest
  existingPrompts.sort((a, b) => compareSemver(b.version, a.version));
}

export function getPrompt(id: string, version?: string): PromptTemplate {
  const prompts = registry[id];
  if (!prompts || prompts.length === 0) {
    throw new Error(`Prompt ${id} not found.`);
  }

  if (version) {
    const match = prompts.find((p) => p.version === version);
    if (!match) {
      throw new Error(`Prompt ${id} version ${version} not found.`);
    }
    return match;
  }

  // Return latest
  return prompts[0] as PromptTemplate;
}

export function resetRegistry(): void {
  for (const key of Object.keys(registry)) {
    delete registry[key];
  }
}
