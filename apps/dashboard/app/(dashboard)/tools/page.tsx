import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tools | WA Chat Operator Dashboard',
  description: 'Manage tools and integrations.',
};

export default function ToolsPage() {
  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Tools</h1>
        <p className="text-muted-foreground">
          Manage your external tools and integrations here. (Coming soon)
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-12 text-center dark:border-gray-800 dark:bg-gray-900/50">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          TODO: This page is a placeholder for future integrations.
        </p>
      </div>
    </div>
  );
}
