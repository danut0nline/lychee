import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import {
  findNextChesscomPuzzle,
  getChesscomRating,
  listChesscomPuzzles,
} from '@/lib/store';
import { CHESSCOM_INITIAL_RATING } from '@/src/chesscom/rating';

export async function GET() {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to practice game puzzles.' },
      { status: 401 }
    );
  }

  const storedRating = await getChesscomRating(user.id);
  const rating = storedRating
    ? {
        rating: storedRating.rating,
        ratingDeviation: storedRating.ratingDeviation,
        volatility: storedRating.volatility,
        numberOfResults: storedRating.numberOfResults,
      }
    : CHESSCOM_INITIAL_RATING;
  const puzzle = await findNextChesscomPuzzle(user.id, rating.rating);
  if (puzzle) {
    return NextResponse.json(
      {
        rating,
        puzzle: {
          id: puzzle.id,
          fen: puzzle.fen,
          solutionLine: puzzle.solutionLine,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const allPuzzles = await listChesscomPuzzles(user.id);
  return NextResponse.json(
    {
      rating,
      puzzle: null,
      emptyState:
        allPuzzles.length === 0 ? 'no-puzzles' : 'all-solved-or-review-pending',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
