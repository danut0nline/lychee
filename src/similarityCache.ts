import { Puzzle } from '../types/lichess-api';
import similarity_distance from '../src/similarity';
import { getUserSolvedPuzzleIDs } from '@/app/api/puzzle/nextPuzzle/nextFor';
import type { User } from '@/lib/auth-types';
import {
  findPuzzleById as readPuzzleById,
  getSimilarityCache,
  listPuzzlesInRatingRange,
} from '@/lib/store';

const cache_size = 30;

export interface SimilarityInstance {
  puzzleId: string;
  cache: Array<string>;
}

export const findSimilarityInstance = async (
  puzzleId: string
): Promise<SimilarityInstance | undefined> => {
  return getSimilarityCache(puzzleId);
};

export const findPuzzlebyId = async (
  puzzleId: string
): Promise<Puzzle | undefined> => {
  return readPuzzleById(puzzleId);
};

export const computeSimilarityCache = async (
  puzzle: Puzzle
): Promise<Array<string>> => {
  const radius = 300;
  const allPuzzles = await listPuzzlesInRatingRange(
    puzzle.Rating - radius,
    puzzle.Rating + radius
  );

  if (allPuzzles.length === 0) {
    throw new Error('cant get all puzzles from testPuzzles');
  }

  let memo = new Map<string, number>();
  let distanceList = allPuzzles.map((p) => {
    if (memo.has(p.hierarchy_tags))
      return [p.PuzzleId, memo.get(p.hierarchy_tags)];
    const distance = similarity_distance(
      p.hierarchy_tags,
      puzzle.hierarchy_tags
    );
    memo.set(p.hierarchy_tags, distance);
    return [p.PuzzleId, distance];
  });
  distanceList.sort((a, b) => (a[1] as number) - (b[1] as number));
  distanceList = distanceList.slice(0, cache_size);
  const similarityCache = distanceList.map((e) => e[0]);

  return similarityCache as string[];
};

export const findSimilarUndoPuzzle = async (
  instance: SimilarityInstance,
  user: User
): Promise<string> => {
  const cache = instance.cache;
  const solved = new Set(await getUserSolvedPuzzleIDs(user));
  for (let i = 0; i < cache.length; i++) {
    const curPuzzleId = cache[i];
    if (solved.has(curPuzzleId.toString())) {
      continue;
    } else {
      return curPuzzleId;
    }
  }
  return 'Whole cache has been solved.';
};
