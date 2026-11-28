import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { getChesscomImportJob, updateChesscomImportJob } from '@/lib/store';

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
  if (job.analysisStatus === 'running') {
    await updateChesscomImportJob(user.id, job.id, {
      analysisStatus: 'paused',
      updatedAt: Date.now(),
    });
  }
  return new Response(null, { status: 204 });
}
