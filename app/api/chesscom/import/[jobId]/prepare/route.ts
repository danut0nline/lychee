import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import {
  createChesscomAnalysisPositions,
  getChesscomJobAnalysisStats,
  getChesscomImportJob,
  listChesscomGamesForJob,
  updateChesscomGameAnalysisStatus,
  updateChesscomImportJob,
} from '@/lib/store';
import { replayConfiguredPlayerMoves } from '@/src/chesscom/replay';

type RouteContext = { params: { jobId: string } };

export async function POST(_request: Request, { params }: RouteContext) {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to prepare imported games.' },
      { status: 401 }
    );
  }

  const job = await getChesscomImportJob(user.id, params.jobId);
  if (!job) {
    return NextResponse.json(
      { error: 'Import job not found.' },
      { status: 404 }
    );
  }
  if (job.status === 'running' || job.status === 'queued') {
    return NextResponse.json(
      {
        error: 'Wait for the game import to finish before preparing positions.',
      },
      { status: 409 }
    );
  }
  if (job.status === 'failed') {
    return NextResponse.json(
      {
        error:
          'Resume or restart the failed import before preparing positions.',
      },
      { status: 409 }
    );
  }

  const games = await listChesscomGamesForJob(user.id, job.id);
  let skippedGames = 0;

  for (const game of games) {
    try {
      const replay = replayConfiguredPlayerMoves({
        pgn: game.pgn,
        sourceUsername: game.sourceUsername,
        whiteUsername: game.whiteUsername,
        blackUsername: game.blackUsername,
      });
      if (replay.positions.length === 0) {
        skippedGames += 1;
        await updateChesscomGameAnalysisStatus(
          user.id,
          game.id,
          'skipped',
          'The game contains no moves for the configured account.'
        );
        continue;
      }

      await createChesscomAnalysisPositions(
        replay.positions.map((position) => ({
          id: randomUUID(),
          userId: user.id,
          gameId: game.id,
          ply: position.ply,
          fen: position.fen,
          playedMove: position.playedMove,
          status: 'pending',
        }))
      );
      await updateChesscomGameAnalysisStatus(user.id, game.id, 'ready');
    } catch (error) {
      skippedGames += 1;
      await updateChesscomGameAnalysisStatus(
        user.id,
        game.id,
        'skipped',
        error instanceof Error
          ? error.message
          : 'The PGN could not be replayed.'
      );
    }
  }

  const analysisStats = await getChesscomJobAnalysisStats(user.id, job.id);
  await updateChesscomImportJob(user.id, job.id, {
    totalPositions: analysisStats.totalPositions,
    processedPositions: analysisStats.processedPositions,
    candidateCount: analysisStats.candidateCount,
    failureCount: analysisStats.failureCount,
    analysisStatus:
      analysisStats.totalPositions > 0 &&
      analysisStats.processedPositions === analysisStats.totalPositions &&
      analysisStats.failureCount === 0
        ? 'completed'
        : analysisStats.failureCount > 0
          ? 'paused'
          : 'idle',
    skippedCount: skippedGames,
    updatedAt: Date.now(),
  });
  return NextResponse.json(
    { jobId: job.id, ...analysisStats, skippedGames },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
