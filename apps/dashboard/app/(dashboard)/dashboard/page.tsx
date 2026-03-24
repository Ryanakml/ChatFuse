import { getCurrentSession } from '@/lib/supabase/auth';
import { handleSignOut } from '../../actions';
import { redirect } from 'next/navigation';
import { KpiDashboard } from '@/components/kpi-dashboard';


export default async function DashboardHome() {
  const session = await getCurrentSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <>
      <div className="font-sans">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-xl font-semibold">WA Chat Operator Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {session.email}
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {session.role || 'No Role'}
            </span>
            <form action={handleSignOut}>
              <button
                type="submit"
                className="rounded border border-transparent px-3 py-1 text-sm text-red-600 transition-colors hover:border-red-200 hover:text-red-700 dark:text-red-400 dark:hover:border-red-900 dark:hover:text-red-300"
              >
                Sign Out
              </button>
            </form>
          </div>
        </header>

        <main className="mx-auto max-w-5xl space-y-6 p-6">
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-medium text-gray-800 dark:text-gray-100">
              Your Permissions
            </h2>

            {session.role === 'admin' && (
              <div className="rounded border border-blue-100 bg-blue-50 p-4 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                <h3 className="mb-1 font-semibold">Full system access</h3>
                <p className="text-sm opacity-90">
                  You can manage all settings, view any conversation, and assign users.
                </p>
              </div>
            )}

            {session.role === 'support_agent' && (
              <div className="rounded border border-green-100 bg-green-50 p-4 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
                <h3 className="mb-1 font-semibold">View conversations</h3>
                <p className="text-sm opacity-90">
                  You can take over conversations, reply to users, and manage escalations.
                </p>
              </div>
            )}

            {session.role === 'analyst' && (
              <div className="rounded border border-purple-100 bg-purple-50 p-4 text-purple-800 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-200">
                <h3 className="mb-1 font-semibold">View analytics & reports</h3>
                <p className="text-sm opacity-90">
                  You have read-only access to operational KPIs and telemetry dashboards.
                </p>
              </div>
            )}

            {!session.role && (
              <div className="rounded border border-yellow-100 bg-yellow-50 p-4 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-200">
                <h3 className="mb-1 font-semibold">Role Pending</h3>
                <p className="text-sm opacity-90">
                  Your account is active but has no assigned role. Contact an admin.
                </p>
              </div>
            )}
          </section>

          {(session.role === 'admin' || session.role === 'analyst') && (
            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-4 text-lg font-medium text-gray-800 dark:text-gray-100">
                Operational KPIs
              </h2>
              <KpiDashboard />
            </section>
          )}
        </main>
      </div>
    </>
  );
}
