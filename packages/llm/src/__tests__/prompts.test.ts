import { describe, it, expect } from 'vitest';
import { getPrompt, registerPrompt } from '../prompts/versioning.js';
import { SYSTEM_INVARIANTS, getSystemPrompt } from '../prompts/system.js';

describe('Prompt Governance (G4)', () => {
  describe('Semantic Versioning Registry', () => {
    it('stores and retrieves prompts by version and ID', () => {
      registerPrompt({ id: 'dummy', version: '1.0.0', content: 'A' });
      registerPrompt({ id: 'dummy', version: '2.0.0', content: 'C' });
      registerPrompt({ id: 'dummy', version: '1.1.0', content: 'B' });

      expect(getPrompt('dummy', '1.0.0').content).toBe('A');
      expect(getPrompt('dummy', '1.1.0').content).toBe('B');
      expect(getPrompt('dummy', '2.0.0').content).toBe('C');

      // Default to returning latest descending (2.0.0)
      expect(getPrompt('dummy').content).toBe('C');
    });

    it('throws on duplicate registration', () => {
      registerPrompt({ id: 'dup', version: '1.0.0', content: 'A' });
      expect(() => {
        registerPrompt({ id: 'dup', version: '1.0.0', content: 'B' });
      }).toThrow('already registered');
    });

    it('throws when prompt not found', () => {
      expect(() => getPrompt('missing')).toThrow('not found');
      expect(() => getPrompt('dummy', '3.0.0')).toThrow('not found');
    });
  });

  describe('Prompt Invariants', () => {
    it('system prompt includes mandatory safety invariants', () => {
      const prompt = getSystemPrompt();
      expect(prompt).toContain('Do not generate harmful, offensive, or abusive content.');
      expect(prompt).toContain('Maintain a professional, polite, and helpful brand voice');
      expect(prompt).toContain('Do NOT invent or fabricate transactional claims');
      expect(prompt).toContain('ask for clarification or state that you will escalate');
      expect(prompt).toContain('Adhere strictly to provided tool schemas');

      // Ensure the entire block is present
      expect(prompt).toContain(SYSTEM_INVARIANTS);
    });

    it('all registered versions of system_role include invariants', () => {
      const v1 = getPrompt('system_role', '1.0.0').content;
      const v11 = getPrompt('system_role', '1.1.0').content;

      expect(v1).toContain(SYSTEM_INVARIANTS);
      expect(v11).toContain(SYSTEM_INVARIANTS);
    });
  });
});
