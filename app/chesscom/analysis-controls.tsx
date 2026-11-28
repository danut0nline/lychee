'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { analyzePlayedMove } from '@/src/stockfish/analysis';

type Props = {
  jobId: string;
  totalPositions: number;
  analysisStatus: string;
  failureCount: number;
  onUpdated: () => Promise<void>;
};

export default function AnalysisControls({
  jobId,
  totalPositions,
  analysisStatus,
  failureCount,
  onUpdated,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const activeController = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      if (activeController.current) {
        activeController.current.abort();
        navigator.sendBeacon(`/api/chesscom/import/${jobId}/analysis/pause`);
      }
    },
    [jobId]
  );

  const startAnalysis = async () => {
    setBusy(true);
    setMessage('');
    setError(false);
    const controller = new AbortController();
    activeController.current = controller;

    const pauseOnClose = () => {
      controller.abort();
      navigator.sendBeacon(`/api/chesscom/import/${jobId}/analysis/pause`);
    };
    window.addEventListener('beforeunload', pauseOnClose);

    try {
      const startResponse = await fetch(
        `/api/chesscom/import/${jobId}/analysis`,
        { method: 'POST' }
      );
      const startResult = await startResponse.json();
      if (!startResponse.ok) {
        throw new Error(startResult.error ?? 'Analysis could not start.');
      }

      while (!controller.signal.aborted) {
        const response = await fetch(
          `/api/chesscom/import/${jobId}/analysis?limit=10`,
          { cache: 'no-store', signal: controller.signal }
        );
        const batch = await response.json();
        if (!response.ok) {
          throw new Error(batch.error ?? 'Could not load analysis positions.');
        }

        if (batch.positions.length === 0) {
          await fetch(`/api/chesscom/import/${jobId}/analysis/complete`, {
            method: 'POST',
            signal: controller.signal,
          });
          await onUpdated();
          setMessage(
            batch.failureCount > 0
              ? `Analysis paused with ${batch.failureCount} failed position(s). Retry them to continue.`
              : `Analysis complete. Found ${batch.candidateCount} puzzle candidate(s).`
          );
          break;
        }

        for (const position of batch.positions) {
          if (controller.signal.aborted) break;
          try {
            const result = await analyzePlayedMove(
              position.fen,
              position.playedMove,
              controller.signal
            );
            const saved = await fetch(
              `/api/chesscom/import/${jobId}/analysis/${position.id}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bestMove: result.bestMove,
                  bestScore: result.bestScore,
                  playedPositionScore: result.playedPositionScore,
                  principalVariation: result.principalVariation,
                }),
                signal: controller.signal,
              }
            );
            if (!saved.ok) {
              throw new Error('The analysis result could not be saved.');
            }
          } catch (cause) {
            if (controller.signal.aborted) break;
            await fetch(
              `/api/chesscom/import/${jobId}/analysis/${position.id}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  error:
                    cause instanceof Error
                      ? cause.message
                      : 'Stockfish analysis failed.',
                }),
              }
            );
          }
          await onUpdated();
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(true);
        setMessage(
          cause instanceof Error
            ? cause.message
            : 'Analysis could not continue.'
        );
        await onUpdated();
      }
    } finally {
      window.removeEventListener('beforeunload', pauseOnClose);
      if (activeController.current === controller) {
        activeController.current = null;
      }
      setBusy(false);
    }
  };

  const retryAnalysisFailures = async () => {
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      const response = await fetch(
        `/api/chesscom/import/${jobId}/analysis/retry-failures`,
        { method: 'POST' }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Could not retry analysis.');
      }
      setMessage(`Retrying ${result.retried} failed position(s).`);
      await startAnalysis();
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error ? cause.message : 'Could not retry analysis.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='space-y-2'>
      {totalPositions > 0 && analysisStatus !== 'completed' && (
        <Button
          type='button'
          variant='outline'
          disabled={busy}
          onClick={startAnalysis}
        >
          {busy || analysisStatus === 'running'
            ? 'Analyze / resume'
            : 'Analyze positions'}
        </Button>
      )}
      {failureCount > 0 && (
        <Button
          type='button'
          variant='outline'
          disabled={busy}
          onClick={retryAnalysisFailures}
        >
          Retry failed positions
        </Button>
      )}
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
