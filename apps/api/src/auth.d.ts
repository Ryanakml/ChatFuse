import type { Request, Response, NextFunction } from 'express';
import type { AppRole } from '@wa-chat/shared';
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                role: AppRole | null;
            };
        }
    }
}
/**
 * Helper to check if a user has a specific role.
 */
export declare function hasRole(userRole: AppRole | null | undefined, requiredRoles: AppRole[]): boolean;
/**
 * Middleware to authenticate requests via Supabase JWT.
 * It expects a Bearer token in the Authorization header.
 */
export declare function authenticateRequest(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * Factory for RBAC enforcement middleware.
 * Use after `authenticateRequest`.
 */
export declare function requireRole(...roles: AppRole[]): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map