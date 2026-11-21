import { Puzzle } from '@/types/lichess-api';
import type { User } from '@/lib/auth-types';
import { addSolvedPuzzle } from '@/lib/store';

const addRound = async (user: User, puzzle: Puzzle): Promise<void> => {
  await addSolvedPuzzle(user.username, puzzle.PuzzleId);
};

export default addRound;
