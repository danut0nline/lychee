import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import {
  getChesscomImportJob,
  getChesscomJobAnalysisStats,
  listJobPendingChesscomAnalysisPositions,
  updateChesscomImportJob,
} from '@/lib/store';

type RouteContext = { params: { jobId: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to analyze games.' },
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
  const requestedLimit = Number(
    request.nextUrl.searchParams.get('limit') ?? 10
  );
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 20)
      : 10;
  const positions = await listJobPendingChesscomAnalysisPositions(
    user.id,
    job.id,
    limit
  );
  const analysisStats = await getChesscomJobAnalysisStats(user.id, job.id);
  return NextResponse.json(
    {
      status: job.analysisStatus,
      ...analysisStats,
      skippedCount: job.skippedCount,
      positions,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(_request: Request, { params }: RouteContext) {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to analyze games.' },
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
  if (!['completed', 'partial'].includes(job.status)) {
    return NextResponse.json(
      { error: 'Finish or pause the game import before analysis.' },
      { status: 409 }
    );
  }
  if (job.totalPositions === 0) {
    return NextResponse.json(
      { error: 'Prepare analysis positions before starting the engine.' },
      { status: 409 }
    );
  }
  if (job.analysisStatus === 'completed') {
    return NextResponse.json(
      { error: 'All positions in this import are already analyzed.' },
      { status: 409 }
    );
  }

  await updateChesscomImportJob(user.id, job.id, {
    analysisStatus: 'running',
    updatedAt: Date.now(),
  });
  return NextResponse.json(
    { jobId: job.id, analysisStatus: 'running' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
