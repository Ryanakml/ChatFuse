import LoginPageClient from './client';

export const metadata = {
  title: 'Login - WA Chat Operator Dashboard',
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message?: string; error?: string };
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded border border-gray-200 bg-white p-8 text-black shadow dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100">
        <h1 className="text-2xl font-bold mb-6 text-center">WA Chat Login</h1>

        {searchParams?.error && (
          <div className="mb-4 rounded bg-red-100 p-3 text-red-700 dark:bg-red-950/40 dark:text-red-200">
            {searchParams.error}
          </div>
        )}

        {searchParams?.message && (
          <div className="mb-4 rounded bg-green-100 p-3 text-green-700 dark:bg-green-950/40 dark:text-green-200">
            {searchParams.message}
          </div>
        )}

        <LoginPageClient />
      </div>
    </div>
  );
}
