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
    <div className="flex h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md p-8 bg-white rounded shadow text-black">
        <h1 className="text-2xl font-bold mb-6 text-center">WA Chat Login</h1>

        {searchParams?.error && (
          <div className="mb-4 bg-red-100 text-red-700 p-3 rounded">{searchParams.error}</div>
        )}

        {searchParams?.message && (
          <div className="mb-4 bg-green-100 text-green-700 p-3 rounded">{searchParams.message}</div>
        )}

        <LoginPageClient />
      </div>
    </div>
  );
}
