import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { getCurrentSession } from '@/lib/supabase/auth';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <SidebarProvider>
      <AppSidebar userEmail={session.email || ''} userRole={session.role || 'operator'} />
      <SidebarInset className="flex-1 overflow-x-hidden bg-gray-50 dark:bg-gray-950">
        <main className="min-h-screen w-full">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
