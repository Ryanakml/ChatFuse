import { describe, it, expect } from 'vitest';
import { hasRole } from './auth.js';

describe('RBAC Authorization', () => {
  describe('hasRole function', () => {
    it('should return false if userRole is null', () => {
      expect(hasRole(null, ['admin'])).toBe(false);
    });

    it('should return false if userRole is undefined', () => {
      expect(hasRole(undefined, ['admin'])).toBe(false);
    });

    it('should return true if userRole is in the required roles list', () => {
      expect(hasRole('admin', ['admin', 'support_agent'])).toBe(true);
      expect(hasRole('support_agent', ['admin', 'support_agent'])).toBe(true);
    });

    it('should return false if userRole is not in the required roles list', () => {
      expect(hasRole('analyst', ['admin', 'support_agent'])).toBe(false);
    });

    it('should return false if required roles list is empty', () => {
      expect(hasRole('admin', [])).toBe(false);
    });

    it('should handle exactly one role correctly', () => {
      expect(hasRole('admin', ['admin'])).toBe(true);
      expect(hasRole('support_agent', ['admin'])).toBe(false);
    });
  });
});
