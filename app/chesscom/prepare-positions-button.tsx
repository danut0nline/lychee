'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  jobId: string;
  onPrepared: () => void;
};

export default function PreparePositionsButton({ jobId, onPrepared }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const prepare = async () => {
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      const response = await fetch(`/api/chesscom/import/${jobId}/prepare`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Games could not be prepared.');
      }
      setMessage(
        `Prepared ${result.totalPositions} position(s); skipped ${result.skippedGames} game(s).`
      );
      onPrepared();
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error ? cause.message : 'Games could not be prepared.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='space-y-1'>
      <Button type='button' variant='outline' disabled={busy} onClick={prepare}>
        {busy ? 'Preparing…' : 'Prepare analysis positions'}
      </Button>
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
