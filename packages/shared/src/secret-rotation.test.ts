import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateSecrets,
  rotateSecret,
  onSecretRotated,
  clearRotationCallbacks,
  REQUIRED_SECRET_NAMES,
} from './secret-rotation.js';

const makeFullEnv = (): Record<string, string> => ({
  WHATSAPP_APP_SECRET: 'secret-app',
  WHATSAPP_ACCESS_TOKEN: 'token-access',
  WHATSAPP_VERIFY_TOKEN: 'verify-token',
  OPENAI_API_KEY: 'sk-openai',
  SUPABASE_SERVICE_ROLE_KEY: 'supabase-role-key',
  REDIS_URL: 'redis://localhost:6379',
});

beforeEach(() => {
  clearRotationCallbacks();
});

describe('validateSecrets', () => {
  it('passes when all required secrets are present', () => {
    const result = validateSecrets(makeFullEnv());
    expect(result.healthy).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.valid).toHaveLength(REQUIRED_SECRET_NAMES.length);
  });

  it('reports missing secrets', () => {
    const env = makeFullEnv();
    delete (env as Record<string, string | undefined>)['OPENAI_API_KEY'];
    const result = validateSecrets(env);
    expect(result.healthy).toBe(false);
    expect(result.missing).toContain('OPENAI_API_KEY');
  });

  it('treats empty string as missing', () => {
    const env = { ...makeFullEnv(), REDIS_URL: '   ' };
    const result = validateSecrets(env);
    expect(result.missing).toContain('REDIS_URL');
  });

  it('reports all missing when env is empty', () => {
    const result = validateSecrets({});
    expect(result.healthy).toBe(false);
    expect(result.missing).toHaveLength(REQUIRED_SECRET_NAMES.length);
  });
});

describe('rotateSecret', () => {
  it('updates the env map with the new value', () => {
    const env = makeFullEnv();
    rotateSecret(env, 'OPENAI_API_KEY', 'sk-new-key');
    expect(env['OPENAI_API_KEY']).toBe('sk-new-key');
    // Still valid after rotation
    expect(validateSecrets(env).healthy).toBe(true);
  });

  it('throws if new value is empty', () => {
    const env = makeFullEnv();
    expect(() => rotateSecret(env, 'OPENAI_API_KEY', '')).toThrow();
    expect(() => rotateSecret(env, 'OPENAI_API_KEY', '   ')).toThrow();
  });

  it('notifies registered callbacks after rotation', () => {
    const env = makeFullEnv();
    const received: Array<{ name: string; value: string }> = [];
    onSecretRotated((name, newValue) => received.push({ name, value: newValue }));

    rotateSecret(env, 'OPENAI_API_KEY', 'sk-rotated');
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ name: 'OPENAI_API_KEY', value: 'sk-rotated' });
  });

  it('does not crash if a callback throws', () => {
    const env = makeFullEnv();
    onSecretRotated(() => {
      throw new Error('callback error');
    });
    // Should not throw
    expect(() => rotateSecret(env, 'OPENAI_API_KEY', 'sk-new')).not.toThrow();
    expect(env['OPENAI_API_KEY']).toBe('sk-new');
  });

  it('notifies multiple callbacks', () => {
    const env = makeFullEnv();
    const calls: string[] = [];
    onSecretRotated((name) => calls.push(`A:${name}`));
    onSecretRotated((name) => calls.push(`B:${name}`));
    rotateSecret(env, 'REDIS_URL', 'redis://new:6379');
    expect(calls).toEqual(['A:REDIS_URL', 'B:REDIS_URL']);
  });
});
