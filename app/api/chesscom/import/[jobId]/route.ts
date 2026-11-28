import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import {
  getChesscomImportJob,
  getChesscomJobAnalysisStats,
  updateChesscomImportJob,
} from '@/lib/store';
import {
  ChesscomImportAlreadyRunningError,
  runChesscomImport,
} from '@/src/chesscom/import';

type RouteContext = { params: { jobId: string } };

export async function GET(_request: Request, { params }: RouteContext) {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to view import status.' },
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
  const analysisStats = await getChesscomJobAnalysisStats(user.id, job.id);
  const analysisStatus =
    analysisStats.totalPositions > 0 &&
    analysisStats.processedPositions === analysisStats.totalPositions &&
    analysisStats.failureCount === 0
      ? 'completed'
      : analysisStats.failureCount > 0
        ? 'paused'
        : job.analysisStatus;
  return NextResponse.json(
    {
      id: job.id,
      sourceUsername: job.sourceUsername,
      status: job.status,
      analysisStatus,
      importedGames: job.importedGames,
      totalGames: job.totalGames,
      totalPositions: analysisStats.totalPositions,
      processedPositions: analysisStats.processedPositions,
      candidateCount: analysisStats.candidateCount,
      skippedCount: job.skippedCount,
      failureCount: analysisStats.failureCount,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(_request: Request, { params }: RouteContext) {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to resume imports.' },
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
  if (job.status === 'completed') {
    return NextResponse.json(
      { error: 'This import has already completed.' },
      { status: 409 }
    );
  }

  try {
    return NextResponse.json(await runChesscomImport(user.id, job.id));
  } catch (error) {
    if (error instanceof ChesscomImportAlreadyRunningError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    await updateChesscomImportJob(user.id, job.id, {
      status: 'failed',
      error: 'The import stopped unexpectedly. Check status and try again.',
      updatedAt: Date.now(),
    });
    return NextResponse.json(
      {
        jobId: job.id,
        status: 'failed',
        error: 'The import stopped unexpectedly. Check status and try again.',
      },
      { status: 500 }
    );
  }
}
