'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = { onDeleted: () => void };

export default function DeleteGameDataButton({ onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const deleteData = async () => {
    const confirmed = window.confirm(
      'Delete all imported Chess.com games, analysis, generated puzzles, solve history, and the private category rating? Your configured username and shared Lichess data will be kept.'
    );
    if (!confirmed) return;

    setDeleting(true);
    setMessage('');
    setError(false);
    try {
      const response = await fetch('/api/chesscom/data', { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Imported data could not be deleted.');
      }
      onDeleted();
      setMessage(
        'Imported games and all related private puzzle data were deleted. Your Chess.com setting was kept.'
      );
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'Imported data could not be deleted.'
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className='space-y-2 border-t pt-4'>
      <Button
        type='button'
        variant='destructive'
        disabled={deleting}
        onClick={deleteData}
      >
        {deleting ? 'Deleting…' : 'Delete imported game data'}
      </Button>
      <p className='text-xs text-muted-foreground'>
        Removes imported PGNs, analysis, generated puzzles, review progress, and
        this category&apos;s rating. Keeps your Chess.com setting and shared
        Lichess data.
      </p>
      {message && (
        <p
          role={error ? 'alert' : 'status'}
          className={error ? 'text-sm text-destructive' : 'text-sm'}
        >
          {message}
        </p>
      )}
    </div>
  );
}
