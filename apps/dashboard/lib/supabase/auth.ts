import { createClient } from './server';
import type { AppRole } from '@wa-chat/shared';

export type UserSession = {
  id: string;
  email: string;
  role: AppRole | null;
};

export async function getCurrentSession(): Promise<UserSession | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return null;
  }

  // Fetch the role from user_roles
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  return {
    id: user.id,
    email: user.email!,
    role: roleData?.role as AppRole | null,
  };
}

export async function requireAuth(): Promise<UserSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function requireRole(roles: AppRole[]): Promise<UserSession> {
  const session = await requireAuth();
  if (!session.role || !roles.includes(session.role)) {
    throw new Error('Forbidden');
  }
  return session;
}
