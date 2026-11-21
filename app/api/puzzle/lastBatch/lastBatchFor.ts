import { Puzzle } from '@/types/lichess-api';
import type { User } from '@/lib/auth-types';
import { getLastBatch } from '@/lib/store';

// Returns empty array if no last batch is found.
const lastBatchFor = async (user: User): Promise<Puzzle[]> => {
  return getLastBatch(user.username);
};

export default lastBatchFor;
