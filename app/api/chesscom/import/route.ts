import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import {
  createChesscomImportJob,
  getChesscomUsername,
  updateChesscomImportJob,
} from '@/lib/store';
import {
  ChesscomImportAlreadyRunningError,
  createImportWindow,
  runChesscomImport,
} from '@/src/chesscom/import';

export async function POST() {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to import games.' },
      { status: 401 }
    );
  }

  const username = await getChesscomUsername(user.id);
  if (!username) {
    return NextResponse.json(
      { error: 'Add and verify a Chess.com username in Settings first.' },
      { status: 400 }
    );
  }

  const now = Date.now();
  const { windowStart, windowEnd } = createImportWindow(now);
  const job = await createChesscomImportJob({
    id: randomUUID(),
    userId: user.id,
    sourceUsername: username,
    status: 'queued',
    windowStart,
    windowEnd,
    createdAt: now,
    updatedAt: now,
  });

  try {
    const result = await runChesscomImport(user.id, job.id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ChesscomImportAlreadyRunningError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    await updateChesscomImportJob(user.id, job.id, {
      status: 'failed',
      error:
        'The import stopped unexpectedly. Check status and try resuming it.',
      updatedAt: Date.now(),
    });
    return NextResponse.json(
      {
        jobId: job.id,
        status: 'failed',
        error:
          'The import stopped unexpectedly. Check status and try resuming it.',
      },
      { status: 500 }
    );
  }
}
