import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import {
  getChesscomImportJob,
  retryChesscomAnalysisFailures,
  updateChesscomImportJob,
} from '@/lib/store';

type RouteContext = { params: { jobId: string } };

export async function POST(_request: Request, { params }: RouteContext) {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to retry analysis.' },
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
  const retried = await retryChesscomAnalysisFailures(user.id, job.id);
  await updateChesscomImportJob(user.id, job.id, {
    analysisStatus: retried > 0 ? 'idle' : job.analysisStatus,
    updatedAt: Date.now(),
  });
  return NextResponse.json({ retried });
}
