import {
  Rating,
  getExistingUserRating,
  getThemeRatings,
} from '@/src/rating/getRating';
import { Puzzle } from '@/types/lichess-api';
import type { User } from '@/lib/auth-types';
import sm2RandomThemeFromRatingMap from '../../../../src/sm2';
import frequentiallyRandomTheme, { isIrrelevant } from './themeGenerator';
import { booleanWithProbability, toGroupId } from '@/lib/utils';
import { nextLeitnerReview } from '@/src/LeitnerIntance';
import { similarBatchForCompromised } from '../similarBatch/similarBatchFor';
import {
  deleteActivePuzzle,
  findPuzzleForRating,
  getActivePuzzle,
  getSolvedPuzzleIds,
  saveActivePuzzle,
} from '@/lib/store';

const MAX_REPS: number = 12;
const MAX_COMPROMISE: number = 3;

const LEITNER_PROBABILITY: number = 0.2;
const MIN_CANDIDATES: number = 10;

export type PuzzleWithUserRating = {
  puzzle: Puzzle | undefined;
  rating: Rating;
  similar?: Puzzle[];
};

export const getUserSolvedPuzzleIDs = async (user: User): Promise<string[]> => {
  return getSolvedPuzzleIds(user.username);
};

// Clamp rating between 400 and 2700, similar to
// https://github.com/clarkerubber/lila/blob/1651e001c4e2794a6b6804860fc729401a670469/modules/puzzle/src/main/Selector.scala#L63
export const clampRating = (glicko: number): number =>
  Math.max(400, Math.min(2700, glicko));

// We compute the radius (`ratingFlex`) as in
// https://github.com/lichess-org/lila/blob/e6ce7245b528035ba9bc6ee37ae34799728cdc19/modules/puzzle/src/main/PuzzlePath.scala#L43
// except, since we don't use paths, we allow for a larger initial radius by compromoie = 1, scaling by a factor of 3/4;
export const radiusForRating = (rating: number, compromise: number): number =>
  0.75 * compromise * (100 + Math.abs(1500 - rating) / 4);

const nextPuzzleForThemeAndRating = async (
  username: string,
  theme: string,
  rawRating: number,
  compromise: number = 1
): Promise<Puzzle | undefined> => {
  if (compromise > MAX_COMPROMISE) {
    return undefined;
  }
  const rating = compromise > 1 ? rawRating : clampRating(rawRating);
  const radius = radiusForRating(rating, compromise);
  console.log(`radius = ${radius}, theme = ${theme}, rating = ${rating}`);
  const p = await findPuzzleForRating(
    username,
    theme,
    rating - radius,
    rating + radius
  );
  // No puzzle found; increase compromise.
  if (!p) {
    return await nextPuzzleForThemeAndRating(
      username,
      theme,
      rating,
      compromise + 1
    );
  }
  return p;
};

const nextPuzzleRepetitions = async (
  username: string,
  userRating: number,
  reps: number,
  ratingMap: Map<string, Rating>
): Promise<Puzzle | undefined> => {
  if (reps == MAX_REPS) {
    console.log('Maximum repetitions reached during puzzle selection');
    return undefined;
  }
  let rating = userRating;
  let theme = frequentiallyRandomTheme();
  // If the theme is not in the rating map, let's try to use it.
  // Otherwise, let's run probabilistic SM2 on the rating map.
  const useSpacedRep = ratingMap.has(theme);
  if (useSpacedRep) {
    theme = await sm2RandomThemeFromRatingMap(username, ratingMap);
    rating = ratingMap.get(theme)!.rating;
    console.log(`Using rating: ${rating} for theme: ${theme}`);
  }
  const p = await nextPuzzleForThemeAndRating(username, theme, rating);
  if (p) {
    if (isIrrelevant(theme)) {
      throw new Error(
        'Irrelevant theme found - incorrect/no filtering has occured.'
      );
    }
    console.log(
      `Found theme ${theme} ${useSpacedRep ? 'through SM2' : 'frequentially'} after ${reps} reps.`
    );
    return p;
  }
  return await nextPuzzleRepetitions(username, rating, reps + 1, ratingMap);
};

const nextThemedPuzzlesForRepetitions = async (
  username: string,
  userRating: number,
  ratingMap: Map<string, Rating>,
  reps: number,
  themeGroup: string[]
): Promise<Puzzle | undefined> => {
  if (reps == MAX_REPS) {
    console.log('Maximum repetitions reached during puzzle selection');
    return undefined;
  }
  const theme = themeGroup[Math.floor(Math.random() * themeGroup.length)];
  // If theme is present in rating map, use its rating for adaptive difficulty
  // selection. Otherwise, use user's rating.
  const rating = ratingMap.get(theme)?.rating || userRating;
  console.log(`Using rating: ${rating} for theme: ${theme}`);
  const p = await nextPuzzleForThemeAndRating(username, theme, rating);
  if (p) {
    console.log(`Found grouped theme ${theme} after ${reps} reps.`);
    return p;
  }
  return await nextThemedPuzzlesForRepetitions(
    username,
    userRating,
    ratingMap,
    reps + 1,
    themeGroup
  );
};

const nextPuzzleFor = async (
  user: User,
  woodpecker: boolean = false,
  themeGroup: string[] = []
): Promise<PuzzleWithUserRating> =>
  getExistingUserRating(user).then(async (rating) => {
    const groupId = toGroupId(themeGroup);

    if (!woodpecker) {
      const activePuzzle = await getActivePuzzle(user.username);
      if (activePuzzle) {
        if (groupId !== activePuzzle.groupId) {
          // NB: Preserving active puzzles per-modes is tricky. We can't permit this mode solving that puzzle,
          // then back in previous mode user solving it again.
          await deleteActivePuzzle(user.username);
        } else {
          console.log('Found active puzzle');
          return {
            puzzle: activePuzzle.puzzle,
            rating: rating,
            similar: activePuzzle.reviewee ? [activePuzzle.reviewee] : [],
          };
        }
      }
    }

    const result = await (async () => {
      // TODO: Iterate to better handle repeat avoidance.
      const exceptions = await getUserSolvedPuzzleIDs(user);
      if (!woodpecker && booleanWithProbability(LEITNER_PROBABILITY)) {
        console.log('Trying to use Leitner...');
        const puzzleToReview = await nextLeitnerReview(user, groupId);
        if (puzzleToReview) {
          console.log(
            `Worked! Puzzle Id: ${puzzleToReview.PuzzleId} from Leitner, tags: ${puzzleToReview.hierarchy_tags}`
          );
          const [similarPuzzle] = await similarBatchForCompromised(
            user,
            [puzzleToReview],
            clampRating(rating.rating),
            exceptions,
            MIN_CANDIDATES,
            false
          );
          console.log(
            `Got similar puzzle with tags ${similarPuzzle.hierarchy_tags} and line ${similarPuzzle.Moves}`
          );
          return {
            puzzle: similarPuzzle,
            similar: [puzzleToReview],
          };
        }
      }
      // NB: The persisted rating map may contain irrelevant themes, but we don't
      // want to include these for nextPuzzle / SM2, so we filter them out below.
      const ratingMap = await getThemeRatings(user, true);
      return {
        puzzle: groupId
          ? await nextThemedPuzzlesForRepetitions(
              user.username,
              rating.rating,
              ratingMap,
              0,
              themeGroup
            )
          : await nextPuzzleRepetitions(
              user.username,
              rating.rating,
              0,
              ratingMap
            ),
      };
    })();

    if (result.puzzle) {
      console.log(
        `Got puzzle with themes ${result.puzzle.Themes} and rating ${result.puzzle.Rating} and line ${result.puzzle.Moves}`
      );
      // Persist selection as active puzzle.
      if (!woodpecker) {
        await saveActivePuzzle(
          user.username,
          result.puzzle,
          result.similar?.[0],
          groupId
        );
      }
    }
    return { ...result, rating };
  });

export default nextPuzzleFor;
