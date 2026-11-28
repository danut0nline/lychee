import { redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';
import {
  getChesscomJobAnalysisStats,
  getChesscomUsername,
  listChesscomImportJobs,
} from '@/lib/store';
import ChesscomImportPanel from './import-panel';

export const dynamic = 'force-dynamic';

export default async function ChesscomGamesPage() {
  const { user } = await validateRequest();
  if (!user) redirect('/unauthorized');

  const [username, jobs] = await Promise.all([
    getChesscomUsername(user.id),
    listChesscomImportJobs(user.id),
  ]);
  const summaries = await Promise.all(
    jobs.map(async (job) => {
      const stats = await getChesscomJobAnalysisStats(user.id, job.id);
      const analysisStatus =
        stats.totalPositions > 0 &&
        stats.processedPositions === stats.totalPositions &&
        stats.failureCount === 0
          ? 'completed'
          : stats.failureCount > 0
            ? 'paused'
            : job.analysisStatus;
      return {
        id: job.id,
        sourceUsername: job.sourceUsername,
        status: job.status,
        analysisStatus,
        importedGames: job.importedGames,
        totalGames: job.totalGames,
        totalPositions: stats.totalPositions,
        processedPositions: stats.processedPositions,
        candidateCount: stats.candidateCount,
        skippedCount: job.skippedCount,
        failureCount: stats.failureCount,
        error: job.error,
        createdAt: job.createdAt,
      };
    })
  );

  return (
    <main className='mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-8 px-4 py-12'>
      <header className='space-y-2'>
        <h1 className='text-4xl font-extrabold tracking-tight'>
          Chess.com games
        </h1>
        <p className='text-muted-foreground'>
          Import up to 100 recent standard games from your configured public
          Chess.com account.
        </p>
      </header>
      <ChesscomImportPanel
        username={username ?? null}
        initialJobs={summaries}
      />
    </main>
  );
}
