import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import {
  getChesscomImportJob,
  getChesscomJobAnalysisStats,
  updateChesscomImportJob,
} from '@/lib/store';

type RouteContext = { params: { jobId: string } };

export async function POST(_request: Request, { params }: RouteContext) {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const job = await getChesscomImportJob(user.id, params.jobId);
  if (!job) {
    return NextResponse.json(
      { error: 'Import job not found.' },
      { status: 404 }
    );
  }

  const analysisStats = await getChesscomJobAnalysisStats(user.id, job.id);
  const jobStats = {
    totalPositions: analysisStats.totalPositions,
    processedPositions: analysisStats.processedPositions,
    candidateCount: analysisStats.candidateCount,
    failureCount: analysisStats.failureCount,
  };
  if (analysisStats.pendingPositions > 0 || analysisStats.failureCount > 0) {
    await updateChesscomImportJob(user.id, job.id, {
      ...jobStats,
      analysisStatus: 'paused',
      updatedAt: Date.now(),
    });
    return NextResponse.json({ analysisStatus: 'paused' });
  }

  await updateChesscomImportJob(user.id, job.id, {
    ...jobStats,
    analysisStatus: 'completed',
    updatedAt: Date.now(),
  });
  return NextResponse.json({ analysisStatus: 'completed' });
}
