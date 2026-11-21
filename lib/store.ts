import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  lt,
  notExists,
  notInArray,
  sql,
} from 'drizzle-orm';
import { db } from './db';
import {
  activePuzzles,
  initialRatings,
  lastBatches,
  leitnerReviews,
  puzzles,
  puzzleThemes,
  ratingHistory,
  ratings,
  recentGroups,
  sessions,
  similarityCaches,
  solvedPuzzles,
  themeTimes,
  userThemeRatings,
  users,
} from './schema';
import type { Puzzle } from '@/types/lichess-api';

export type AppUser = { id: string; username: string };
export type StoredRating = {
  rating: number;
  ratingDeviation: number;
  volatility: number;
  numberOfResults: number;
};

export type RatingHistoryRecord = {
  theme: string;
  rating: number;
  createdAt: Date;
};

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

export async function getUserByUsername(
  username: string
): Promise<AppUser | undefined> {
  return db.select().from(users).where(eq(users.username, username)).get();
}

export async function getUserById(id: string): Promise<AppUser | undefined> {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export async function createUser(user: AppUser): Promise<void> {
  await db.insert(users).values(user).onConflictDoNothing();
}

export async function createSession(
  tokenHash: string,
  userId: string,
  expiresAt: Date
): Promise<void> {
  await db.insert(sessions).values({
    tokenHash,
    userId,
    expiresAt: expiresAt.getTime(),
  });
}

export async function getSessionByTokenHash(tokenHash: string) {
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .get();
}

export async function updateSessionExpiry(
  tokenHash: string,
  expiresAt: Date
): Promise<void> {
  await db
    .update(sessions)
    .set({ expiresAt: expiresAt.getTime() })
    .where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function createInitialUserData(
  username: string,
  rating: StoredRating
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(ratings)
      .values({ username, ...rating })
      .onConflictDoNothing();
    await tx
      .insert(initialRatings)
      .values({ username, rating: rating.rating })
      .onConflictDoNothing();
  });
}

export async function getRating(
  username: string
): Promise<StoredRating | undefined> {
  return db.select().from(ratings).where(eq(ratings.username, username)).get();
}

export async function saveRating(
  username: string,
  rating: StoredRating
): Promise<void> {
  await db
    .insert(ratings)
    .values({ username, ...rating })
    .onConflictDoUpdate({
      target: ratings.username,
      set: rating,
    });
}

export async function getInitialRating(
  username: string
): Promise<number | undefined> {
  const row = await db
    .select({ rating: initialRatings.rating })
    .from(initialRatings)
    .where(eq(initialRatings.username, username))
    .get();
  return row?.rating;
}

export async function getSolvedPuzzleIds(username: string): Promise<string[]> {
  const rows = await db
    .select({ puzzleId: solvedPuzzles.puzzleId })
    .from(solvedPuzzles)
    .where(eq(solvedPuzzles.username, username))
    .orderBy(asc(solvedPuzzles.position));
  return rows.map((row) => row.puzzleId);
}

export async function addSolvedPuzzle(
  username: string,
  puzzleId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [{ nextPosition }] = await tx
      .select({
        nextPosition: sql<number>`coalesce(max(${solvedPuzzles.position}), -1) + 1`,
      })
      .from(solvedPuzzles)
      .where(eq(solvedPuzzles.username, username));

    await tx
      .insert(solvedPuzzles)
      .values({ username, puzzleId, position: nextPosition })
      .onConflictDoNothing();
  });
}

export async function replaceSolvedPuzzleIds(
  username: string,
  puzzleIds: string[]
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(solvedPuzzles).where(eq(solvedPuzzles.username, username));
    for (let index = 0; index < puzzleIds.length; index += 200) {
      await tx
        .insert(solvedPuzzles)
        .values(
          puzzleIds.slice(index, index + 200).map((puzzleId, offset) => ({
            username,
            puzzleId,
            position: index + offset,
          }))
        )
        .onConflictDoNothing();
    }
  });
}

export async function findPuzzleById(
  puzzleId: string
): Promise<Puzzle | undefined> {
  const row = await db
    .select({ data: puzzles.data })
    .from(puzzles)
    .where(eq(puzzles.puzzleId, puzzleId))
    .get();
  return row ? parseJson<Puzzle>(row.data) : undefined;
}

export async function findPuzzleForRating(
  username: string,
  theme: string,
  minimumRating: number,
  maximumRating: number
): Promise<Puzzle | undefined> {
  const row = await db
    .select({ data: puzzles.data })
    .from(puzzles)
    .where(
      and(
        gt(puzzles.rating, minimumRating),
        lt(puzzles.rating, maximumRating),
        exists(
          db
            .select({ one: sql`1` })
            .from(puzzleThemes)
            .where(
              and(
                eq(puzzleThemes.puzzleId, puzzles.puzzleId),
                eq(puzzleThemes.theme, theme.toLowerCase())
              )
            )
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(solvedPuzzles)
            .where(
              and(
                eq(solvedPuzzles.username, username),
                eq(solvedPuzzles.puzzleId, puzzles.puzzleId)
              )
            )
        )
      )
    )
    .limit(1)
    .get();
  return row ? parseJson<Puzzle>(row.data) : undefined;
}

export async function findPuzzlesForRating(
  username: string,
  minimumRating: number,
  maximumRating: number
): Promise<Puzzle[]> {
  const rows = await db
    .select({ data: puzzles.data })
    .from(puzzles)
    .where(
      and(
        gt(puzzles.rating, minimumRating),
        lt(puzzles.rating, maximumRating),
        notExists(
          db
            .select({ one: sql`1` })
            .from(solvedPuzzles)
            .where(
              and(
                eq(solvedPuzzles.username, username),
                eq(solvedPuzzles.puzzleId, puzzles.puzzleId)
              )
            )
        )
      )
    );
  return rows.map((row) => parseJson<Puzzle>(row.data));
}

export async function listPuzzlesInRatingRange(
  minimumRating: number,
  maximumRating: number
): Promise<Puzzle[]> {
  const rows = await db
    .select({ data: puzzles.data })
    .from(puzzles)
    .where(
      and(gt(puzzles.rating, minimumRating), lt(puzzles.rating, maximumRating))
    );
  return rows.map((row) => parseJson<Puzzle>(row.data));
}

export async function findPuzzleBatch(
  username: string,
  minimumRating: number,
  maximumRating: number,
  limit: number,
  excludedIds: string[] = []
): Promise<Puzzle[]> {
  const conditions = [
    gt(puzzles.rating, minimumRating),
    lt(puzzles.rating, maximumRating),
    notExists(
      db
        .select({ one: sql`1` })
        .from(solvedPuzzles)
        .where(
          and(
            eq(solvedPuzzles.username, username),
            eq(solvedPuzzles.puzzleId, puzzles.puzzleId)
          )
        )
    ),
  ];
  if (excludedIds.length > 0) {
    conditions.push(notInArray(puzzles.puzzleId, excludedIds));
  }
  const rows = await db
    .select({ data: puzzles.data })
    .from(puzzles)
    .where(and(...conditions))
    .limit(limit);
  return rows.map((row) => parseJson<Puzzle>(row.data));
}

export async function getActivePuzzle(username: string) {
  const row = await db
    .select()
    .from(activePuzzles)
    .where(eq(activePuzzles.username, username))
    .get();
  return row
    ? {
        puzzle: parseJson<Puzzle>(row.puzzle),
        reviewee: row.reviewee ? parseJson<Puzzle>(row.reviewee) : undefined,
        groupId: row.groupId,
      }
    : undefined;
}

export async function saveActivePuzzle(
  username: string,
  puzzle: Puzzle,
  reviewee: Puzzle | undefined,
  groupId: string
): Promise<void> {
  await db
    .insert(activePuzzles)
    .values({
      username,
      puzzle: JSON.stringify(puzzle),
      reviewee: reviewee ? JSON.stringify(reviewee) : null,
      groupId,
    })
    .onConflictDoUpdate({
      target: activePuzzles.username,
      set: {
        puzzle: JSON.stringify(puzzle),
        reviewee: reviewee ? JSON.stringify(reviewee) : null,
        groupId,
      },
    });
}

export async function deleteActivePuzzle(username: string): Promise<void> {
  await db.delete(activePuzzles).where(eq(activePuzzles.username, username));
}

export async function consumeActivePuzzle(username: string) {
  const row = await db
    .delete(activePuzzles)
    .where(eq(activePuzzles.username, username))
    .returning()
    .get();
  return row
    ? {
        puzzle: parseJson<Puzzle>(row.puzzle),
        reviewee: row.reviewee ? parseJson<Puzzle>(row.reviewee) : undefined,
        groupId: row.groupId,
      }
    : undefined;
}

export async function addRatingHistory(
  username: string,
  theme: string,
  ratingValue: number,
  createdAt = new Date()
): Promise<void> {
  await db.insert(ratingHistory).values({
    username,
    theme,
    rating: ratingValue,
    createdAt: createdAt.getTime(),
  });
}

export async function getRatingHistory(
  username: string,
  theme?: string
): Promise<RatingHistoryRecord[]> {
  const query = db
    .select({
      theme: ratingHistory.theme,
      rating: ratingHistory.rating,
      createdAt: ratingHistory.createdAt,
    })
    .from(ratingHistory)
    .where(
      theme
        ? and(
            eq(ratingHistory.username, username),
            eq(ratingHistory.theme, theme)
          )
        : eq(ratingHistory.username, username)
    )
    .orderBy(asc(ratingHistory.createdAt), asc(ratingHistory.id));
  const rows = await query;
  return rows.map((row) => ({
    theme: row.theme,
    rating: row.rating,
    createdAt: new Date(row.createdAt),
  }));
}

export async function getUserThemeRatings(
  username: string
): Promise<Array<{ theme: string } & StoredRating>> {
  return db
    .select()
    .from(userThemeRatings)
    .where(eq(userThemeRatings.username, username));
}

export async function saveUserThemeRating(
  username: string,
  theme: string,
  rating: StoredRating
): Promise<void> {
  await db
    .insert(userThemeRatings)
    .values({ username, theme, ...rating })
    .onConflictDoUpdate({
      target: [userThemeRatings.username, userThemeRatings.theme],
      set: rating,
    });
}

export async function getThemeTime(
  username: string,
  theme: string
): Promise<number | undefined> {
  const row = await db
    .select({ time: themeTimes.time })
    .from(themeTimes)
    .where(and(eq(themeTimes.username, username), eq(themeTimes.theme, theme)))
    .get();
  return row?.time;
}

export async function saveThemeTime(
  username: string,
  theme: string,
  time: number
): Promise<void> {
  await db
    .insert(themeTimes)
    .values({ username, theme, time })
    .onConflictDoUpdate({
      target: [themeTimes.username, themeTimes.theme],
      set: { time },
    });
}

export async function getLeitnerReview(username: string, groupId: string) {
  const row = await db
    .select()
    .from(leitnerReviews)
    .where(
      and(
        eq(leitnerReviews.username, username),
        eq(leitnerReviews.groupId, groupId)
      )
    )
    .get();
  return row
    ? {
        boxA: parseJson<Puzzle[]>(row.boxA),
        boxB: parseJson<Puzzle[]>(row.boxB),
      }
    : undefined;
}

export async function saveLeitnerReview(
  username: string,
  groupId: string,
  boxA: Puzzle[],
  boxB: Puzzle[]
): Promise<void> {
  await db
    .insert(leitnerReviews)
    .values({
      username,
      groupId,
      boxA: JSON.stringify(boxA),
      boxB: JSON.stringify(boxB),
    })
    .onConflictDoUpdate({
      target: [leitnerReviews.username, leitnerReviews.groupId],
      set: { boxA: JSON.stringify(boxA), boxB: JSON.stringify(boxB) },
    });
}

export async function getRecentGroups(username: string) {
  return db
    .select()
    .from(recentGroups)
    .where(eq(recentGroups.username, username))
    .orderBy(desc(recentGroups.lastUsed));
}

export async function saveRecentGroup(
  username: string,
  groupId: string,
  lastUsed = new Date()
): Promise<void> {
  await db
    .insert(recentGroups)
    .values({ username, groupId, lastUsed: lastUsed.getTime() })
    .onConflictDoUpdate({
      target: [recentGroups.username, recentGroups.groupId],
      set: { lastUsed: lastUsed.getTime() },
    });
}

export async function getLastBatch(username: string): Promise<Puzzle[]> {
  const row = await db
    .select({ batch: lastBatches.batch })
    .from(lastBatches)
    .where(eq(lastBatches.username, username))
    .get();
  return row ? parseJson<Puzzle[]>(row.batch) : [];
}

export async function saveLastBatch(
  username: string,
  batch: Puzzle[]
): Promise<void> {
  await db
    .insert(lastBatches)
    .values({ username, batch: JSON.stringify(batch) })
    .onConflictDoUpdate({
      target: lastBatches.username,
      set: { batch: JSON.stringify(batch) },
    });
}

export async function getSimilarityCache(puzzleId: string) {
  const row = await db
    .select()
    .from(similarityCaches)
    .where(eq(similarityCaches.puzzleId, puzzleId))
    .get();
  return row
    ? { puzzleId: row.puzzleId, cache: parseJson<string[]>(row.cache) }
    : undefined;
}

export async function saveSimilarityCache(
  puzzleId: string,
  cache: string[]
): Promise<void> {
  await db
    .insert(similarityCaches)
    .values({ puzzleId, cache: JSON.stringify(cache) })
    .onConflictDoUpdate({
      target: similarityCaches.puzzleId,
      set: { cache: JSON.stringify(cache) },
    });
}
