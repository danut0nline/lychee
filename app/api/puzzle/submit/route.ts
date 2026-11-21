import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { NextRequest } from 'next/server';
import {
  DEFAULT_RATING,
  Rating,
  getExistingUserRating,
  getThemeRatings,
} from '@/src/rating/getRating';
import addRound from './addRound';
import { updateLeitner } from '@/src/LeitnerIntance';
import { toGroupId } from '@/lib/utils';
import updateAndScaleRatings from '@/src/rating/RatingCalculator';
import {
  addRatingHistory,
  consumeActivePuzzle,
  saveRating,
  saveThemeTime,
  saveUserThemeRating,
} from '@/lib/store';

const MILLISECONDS_IN_SECOND = 1000;

export async function POST(req: NextRequest) {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Delete active puzzle, as it is solved.
  const activePuzzle = await consumeActivePuzzle(user.username);
  if (!activePuzzle) {
    throw new Error('No active puzzle found - something is wrong!');
  }

  const userRating = await getExistingUserRating(user);
  const { successStr, themeGroupStr, timeStr } = await req.json();
  const puzzle = activePuzzle.puzzle;
  const success = successStr as boolean;
  const moves = puzzle.Moves.split(' ').length / 2;
  const timePerMove = (timeStr as number) / MILLISECONDS_IN_SECOND / moves;
  const isReview = !!activePuzzle.reviewee;

  // Update and persist user's rating.
  updateAndScaleRatings(userRating, puzzle, success, isReview);
  await saveRating(user.username, userRating);
  await addRatingHistory(user.username, 'overall', userRating.rating);
  // Mark puzzle as solved by user.
  await addRound(user, puzzle);
  // Update Leitner instance (of original puzzle if review).
  await updateLeitner(
    user,
    activePuzzle.reviewee ?? puzzle,
    success,
    toGroupId(themeGroupStr as string[]),
    timePerMove
  );

  // NB: We don't filter out irrelevant themes here. Even if theme is irrelevant, we compute ratings and
  // persist in the DB, as this information may be useful for dashboard analyitcs.
  const ratingMap = await getThemeRatings(user, false);

  for (const theme of puzzle.Themes.split(' ')) {
    const themeRating: Rating = ratingMap.get(theme) || DEFAULT_RATING;
    // Update and persist per-theme ratings.
    updateAndScaleRatings(themeRating, puzzle, success, isReview);
    await saveUserThemeRating(user.username, theme, themeRating);
    // Persist LAST time taken for each theme.
    if (success) {
      await saveThemeTime(user.username, theme, timePerMove);
    }
    // Add entry in theme's rating history.
    await addRatingHistory(user.username, theme, themeRating.rating);
  }

  return new Response(JSON.stringify(userRating), { status: 200 });
}
