'use client';

import { useState } from 'react';
import { addKnowledgeDocument } from '../actions';

export function KnowledgeForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    try {
      await addKnowledgeDocument(formData);
      setIsOpen(false);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'message' in err) {
        setError((err as { message?: string }).message || 'Error uploading document');
      } else {
        setError('Error uploading document');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      >
        + Add Document
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 border dark:border-gray-800">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Add Knowledge Source
            </h2>

            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Document Title
                </label>
                <input
                  type="text"
                  name="title"
                  id="title"
                  required
                  placeholder="e.g., Return Policy 2026"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500 sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div>
                <label
                  htmlFor="sourceType"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Source Type
                </label>
                <select
                  name="sourceType"
                  id="sourceType"
                  defaultValue="policy"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500 sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="policy">Policy / Guideline</option>
                  <option value="faq">FAQ</option>
                  <option value="shipping_rule">Shipping Rule</option>
                  <option value="product_info">Product Information</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="content"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Raw Content (Text)
                </label>
                <textarea
                  name="content"
                  id="content"
                  required
                  rows={8}
                  placeholder="Paste the raw text of the document here..."
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500 sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isLoading}
                  className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isLoading ? 'Processing...' : 'Save Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
