'use client';

import { useState } from 'react';
import { deleteKnowledgeDocument } from '../actions';

interface DeleteButtonProps {
  documentId: string;
  title?: string;
  token?: string; // Kept for prop signature match if needed, but unused since action uses session
}

export function DeleteButton({ documentId, title }: DeleteButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmMessage = title
      ? `Are you sure you want to delete "${title}"? This cannot be undone.`
      : 'Are you sure you want to delete this document?';

    if (!window.confirm(confirmMessage)) return;

    setIsDeleting(true);
    try {
      await deleteKnowledgeDocument(documentId);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'message' in err) {
        alert((err as { message?: string }).message || 'Failed to delete document');
      } else {
        alert('Failed to delete document');
      }
      setIsDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium disabled:opacity-50"
    >
      {isDeleting ? 'Deleting...' : 'Delete'}
    </button>
  );
}
