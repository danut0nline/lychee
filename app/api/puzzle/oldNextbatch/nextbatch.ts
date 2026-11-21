import { Puzzle } from '@/types/lichess-api';
import type { User } from '@/lib/auth-types';
import { findPuzzleBatch } from '@/lib/store';

const RATING_RADIUS = 300;
const BATCH_SIZE = 10;

export async function getPuzzleBatch(
  user: User,
  exceptions: Array<string>
): Promise<Array<Puzzle>> {
  const { perfs } = await fetch(
    `https://lichess.org/api/user/${user?.username}`
  ).then((res) => res.json());
  const rating = perfs['puzzle']['rating'];

  return findPuzzleBatch(
    user.username,
    rating - RATING_RADIUS,
    rating + RATING_RADIUS,
    BATCH_SIZE,
    exceptions
  );
}
