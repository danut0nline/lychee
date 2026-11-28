'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import PreparePositionsButton from './prepare-positions-button';

type ImportJobSummary = {
  id: string;
  sourceUsername: string;
  status: string;
  analysisStatus: string;
  importedGames: number;
  totalGames: number;
  totalPositions: number;
  processedPositions: number;
  candidateCount: number;
  skippedCount: number;
  failureCount: number;
  error: string | null;
  createdAt: number;
};

type Props = {
  username: string | null;
  initialJobs: ImportJobSummary[];
};

export default function ChesscomImportPanel({ username, initialJobs }: Props) {
  const [jobs, setJobs] = useState(initialJobs);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const startImport = async () => {
    setStarting(true);
    setMessage('');
    setIsError(false);
    try {
      const response = await fetch('/api/chesscom/import', { method: 'POST' });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? 'Import could not start.');
      await refreshJob(result.jobId);
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : 'Import could not start.'
      );
    } finally {
      setStarting(false);
    }
  };

  const resumeImport = async (jobId: string) => {
    setBusyJobId(jobId);
    setMessage('');
    setIsError(false);
    try {
      const response = await fetch(`/api/chesscom/import/${jobId}`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? 'Import could not resume.');
      await refreshJob(jobId);
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : 'Import could not resume.'
      );
      await refreshJob(jobId);
    } finally {
      setBusyJobId(null);
    }
  };

  const refreshJob = async (jobId: string) => {
    const response = await fetch(`/api/chesscom/import/${jobId}`, {
      cache: 'no-store',
    });
    if (!response.ok) return;
    const job = (await response.json()) as ImportJobSummary;
    setJobs((current) => [
      job,
      ...current.filter((existing) => existing.id !== jobId),
    ]);
  };

  return (
    <section className='space-y-6 rounded-lg border p-6'>
      <div className='space-y-1'>
        <h2 className='text-xl font-semibold'>Configured public account</h2>
        {username ? (
          <p className='text-sm text-muted-foreground'>{username}</p>
        ) : (
          <p className='text-sm text-muted-foreground'>
            No Chess.com username is configured.
          </p>
        )}
      </div>
      {username ? (
        <>
          <Button type='button' onClick={startImport} disabled={starting}>
            {starting ? 'Importing…' : 'Import recent games'}
          </Button>
        </>
      ) : (
        <Link href='/settings'>
          <Button type='button' variant='outline'>
            Configure a username
          </Button>
        </Link>
      )}
      <p
        role={message ? (isError ? 'alert' : 'status') : undefined}
        className={isError ? 'text-sm text-destructive' : 'text-sm'}
      >
        {message}
      </p>
      <div className='space-y-3'>
        <h2 className='font-semibold'>Import history</h2>
        {jobs.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No imports yet.</p>
        ) : (
          <ul className='space-y-3'>
            {jobs.map((job) => (
              <li key={job.id} className='space-y-2 rounded-md border p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <p className='font-medium'>
                    {job.sourceUsername} · {job.status}
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    {new Date(job.createdAt).toLocaleString()}
                  </p>
                </div>
                <p className='text-sm'>
                  Imported {job.importedGames} game(s)
                  {job.totalPositions > 0 &&
                    ` · ${job.processedPositions}/${job.totalPositions} positions analyzed`}
                  {` · ${job.candidateCount} candidate(s)`}
                  {` · ${job.skippedCount} skipped game(s)`}
                  {` · ${job.failureCount} failed position(s)`}
                </p>
                {job.error && (
                  <p className='text-sm text-destructive'>{job.error}</p>
                )}
                <div className='flex flex-wrap gap-2'>
                  {['partial', 'paused', 'failed'].includes(job.status) && (
                    <Button
                      type='button'
                      variant='outline'
                      disabled={busyJobId === job.id}
                      onClick={() => resumeImport(job.id)}
                    >
                      Resume import
                    </Button>
                  )}
                  {['completed', 'partial', 'paused'].includes(job.status) && (
                    <PreparePositionsButton
                      jobId={job.id}
                      onPrepared={() => refreshJob(job.id)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
