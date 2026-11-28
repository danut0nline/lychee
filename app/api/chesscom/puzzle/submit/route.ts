import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { getChesscomPuzzle, submitChesscomPuzzleAttempt } from '@/lib/store';

export async function POST(request: NextRequest) {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to submit a game puzzle.' },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Send a valid puzzle result.' },
      { status: 400 }
    );
  }
  if (
    !body ||
    typeof body !== 'object' ||
    typeof (body as { puzzleId?: unknown }).puzzleId !== 'string' ||
    typeof (body as { success?: unknown }).success !== 'boolean'
  ) {
    return NextResponse.json(
      { error: 'Send a valid puzzle result.' },
      { status: 400 }
    );
  }

  const puzzleId = (body as { puzzleId: string }).puzzleId;
  const result = await submitChesscomPuzzleAttempt(
    user.id,
    puzzleId,
    (body as { success: boolean }).success
  );
  if (!result) {
    const ownedPuzzle = await getChesscomPuzzle(user.id, puzzleId);
    return ownedPuzzle
      ? NextResponse.json(
          { error: 'This puzzle is not ready for review yet.' },
          { status: 409 }
        )
      : NextResponse.json({ error: 'Game puzzle not found.' }, { status: 404 });
  }

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
