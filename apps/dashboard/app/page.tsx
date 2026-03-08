import { getCurrentSession } from '@/lib/supabase/auth';
import { handleSignOut } from './actions';
import { redirect } from 'next/navigation';

export default async function DashboardHome() {
  const session = await getCurrentSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">WA Chat Operator Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">{session.email}</span>
          <span className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-700 rounded-full border border-gray-200">
            {session.role || 'No Role'}
          </span>
          <form action={handleSignOut}>
            <button
              type="submit"
              className="text-sm text-red-600 hover:text-red-700 px-3 py-1 rounded border border-transparent hover:border-red-200 transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-6">
        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-medium mb-4 text-gray-800">Your Permissions</h2>

          {session.role === 'admin' && (
            <div className="p-4 bg-blue-50 text-blue-800 rounded border border-blue-100">
              <h3 className="font-semibold mb-1">Full system access</h3>
              <p className="text-sm opacity-90">
                You can manage all settings, view any conversation, and assign users.
              </p>
            </div>
          )}

          {session.role === 'support_agent' && (
            <div className="p-4 bg-green-50 text-green-800 rounded border border-green-100">
              <h3 className="font-semibold mb-1">View conversations</h3>
              <p className="text-sm opacity-90">
                You can take over conversations, reply to users, and manage escalations.
              </p>
            </div>
          )}

          {session.role === 'analyst' && (
            <div className="p-4 bg-purple-50 text-purple-800 rounded border border-purple-100">
              <h3 className="font-semibold mb-1">View analytics & reports</h3>
              <p className="text-sm opacity-90">
                You have read-only access to operational KPIs and telemetry dashboards.
              </p>
            </div>
          )}

          {!session.role && (
            <div className="p-4 bg-yellow-50 text-yellow-800 rounded border border-yellow-100">
              <h3 className="font-semibold mb-1">Role Pending</h3>
              <p className="text-sm opacity-90">
                Your account is active but has no assigned role. Contact an admin.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
