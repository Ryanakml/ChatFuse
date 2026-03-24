import { DashboardShell } from '@/components/dashboard-shell';
import { createClient } from '@/lib/supabase/server';
import { KnowledgeForm } from './components/knowledge-form';
import { DeleteButton } from './components/delete-button';

// Force dynamic since we talk to the database
export const dynamic = 'force-dynamic';

export default async function KnowledgePage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  // Directly use API URL for fetching data securely via the new backend endpoint
  // Or simply query supabase directly since we have the component. But dashboard logic prefers API to hit ingestion.
  // Actually GET /api/admin/knowledge might need full URL, we'll fetch direct from DB here like conversations.
  
  const { data: documents, error } = await supabase
    .from('knowledge_documents')
    .select('id, source, title, version, metadata, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching knowledge documents:', error);
  }

  return (
    <DashboardShell>
      <main className="flex-1 p-6 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight">Knowledge Base (RAG)</h1>
            <KnowledgeForm />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">Title</th>
                    <th className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">Type</th>
                    <th className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">Source ID</th>
                    <th className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {documents?.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                        No knowledge documents found.
                      </td>
                    </tr>
                  ) : (
                    documents?.map((doc) => {
                      const metaType = doc.metadata?.sourceType || 'unknown';
                      return (
                        <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                            {doc.title || 'Untitled'}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              {metaType}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-500 dark:text-gray-400 break-all max-w-[200px]">
                            {doc.source}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <DeleteButton documentId={doc.id} title={doc.title} token={session?.access_token || ''} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </DashboardShell>
  );
}
