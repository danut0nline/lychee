import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { NextRequest } from 'next/server';
import {
  SimilarityInstance,
  findSimilarityInstance,
  computeSimilarityCache,
  findSimilarUndoPuzzle,
  findPuzzlebyId,
} from '@/src/similarityCache';
import { Puzzle } from '@/types/lichess-api';
import { saveSimilarityCache } from '@/lib/store';
// import { ComputeBatch } from './computeBatchFor';

export async function POST(req: NextRequest) {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { puzzleId } = await req.json();

  let instance: SimilarityInstance | undefined =
    await findSimilarityInstance(puzzleId);

  if (!instance) {
    let puzzle: Puzzle | undefined = await findPuzzlebyId(puzzleId);
    if (puzzle) {
      const similarPuzzles = await computeSimilarityCache(puzzle as Puzzle);
      const instanceCreated = {
        puzzleId: puzzleId,
        cache: similarPuzzles,
      };
      await saveSimilarityCache(
        instanceCreated.puzzleId,
        instanceCreated.cache.map(String)
      );
    }
  }

  return new Response('', {
    status: 200,
  });
}
