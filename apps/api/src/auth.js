import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_KEY || 'dummy';
// Singleton for API usage
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
/**
 * Helper to check if a user has a specific role.
 */
export function hasRole(userRole, requiredRoles) {
    if (!userRole)
        return false;
    return requiredRoles.includes(userRole);
}
/**
 * Middleware to authenticate requests via Supabase JWT.
 * It expects a Bearer token in the Authorization header.
 */
export async function authenticateRequest(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
            return;
        }
        const token = authHeader.split(' ')[1];
        if (!token) {
            res.status(401).json({ error: 'Unauthorized: Missing token' });
            return;
        }
        // Verify token and get user
        const { data: { user }, error: authError, } = await supabase.auth.getUser(token);
        if (authError || !user) {
            res.status(401).json({ error: 'Unauthorized: Invalid token' });
            return;
        }
        // Fetch role
        const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .single();
        if (roleError && roleError.code !== 'PGRST116') {
            // PGRST116 is the "Result contains 0 rows" error, meaning no role assigned.
            // Other errors are genuine issues
            console.error('Error fetching user role:', roleError);
        }
        req.user = {
            id: user.id,
            email: user.email,
            role: roleData?.role || null,
        };
        next();
    }
    catch (err) {
        console.error('Authentication middleware error:', err);
        res.status(500).json({ error: 'Internal server error during authentication' });
    }
}
/**
 * Factory for RBAC enforcement middleware.
 * Use after `authenticateRequest`.
 */
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized: User not authenticated' });
            return;
        }
        if (!hasRole(req.user.role, roles)) {
            res.status(403).json({ error: 'Forbidden: insufficient permissions' });
            return;
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map