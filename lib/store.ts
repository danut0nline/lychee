import {
  and,
  asc,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  inArray,
  lte,
  lt,
  notExists,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import GameResult from '@/src/rating/GameResult';
import GlickoRating from '@/src/rating/GlickoV2Rating';
import { RatingCalculator } from '@/src/rating/RatingCalculator';
import { CHESSCOM_INITIAL_RATING } from '@/src/chesscom/rating';
import { db } from './db';
import {
  activePuzzles,
  chesscomAnalysisPositions,
  chesscomGames,
  chesscomImportJobs,
  chesscomImportJobGames,
  chesscomPuzzleProgress,
  chesscomPuzzles,
  chesscomRatingHistory,
  chesscomRatings,
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
export type ChesscomImportJob = typeof chesscomImportJobs.$inferSelect;
export type ChesscomGame = typeof chesscomGames.$inferInsert;
export type ChesscomAnalysisPosition =
  typeof chesscomAnalysisPositions.$inferSelect;
export type ChesscomPuzzle = typeof chesscomPuzzles.$inferInsert;
export type ChesscomImportJobUpdate = Partial<
  Pick<
    ChesscomImportJob,
    | 'status'
    | 'analysisStatus'
    | 'totalGames'
    | 'importedGames'
    | 'totalPositions'
    | 'processedPositions'
    | 'candidateCount'
    | 'skippedCount'
    | 'failureCount'
    | 'checkpoint'
    | 'error'
    | 'updatedAt'
  >
>;
export type ChesscomAnalysisCandidate = {
  id: string;
  solutionLine: string;
  estimatedRating: number;
  stockfishVersion: string;
  analysisSettings: string;
  scoreLoss: string;
  ratingFormulaVersion: string;
};
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
  return db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, username))
    .get();
}

export async function getUserById(id: string): Promise<AppUser | undefined> {
  return db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, id))
    .get();
}

export async function createUser(user: AppUser): Promise<void> {
  await db.insert(users).values(user).onConflictDoNothing();
}

export async function getChesscomUsername(
  userId: string
): Promise<string | null | undefined> {
  const row = await db
    .select({ chesscomUsername: users.chesscomUsername })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.chesscomUsername;
}

export async function saveChesscomUsername(
  userId: string,
  chesscomUsername: string | null
): Promise<void> {
  await db.update(users).set({ chesscomUsername }).where(eq(users.id, userId));
}

export async function createChesscomImportJob(
  job: typeof chesscomImportJobs.$inferInsert
): Promise<ChesscomImportJob> {
  return db.insert(chesscomImportJobs).values(job).returning().get();
}

export async function getChesscomImportJob(
  userId: string,
  jobId: string
): Promise<ChesscomImportJob | undefined> {
  return db
    .select()
    .from(chesscomImportJobs)
    .where(
      and(
        eq(chesscomImportJobs.userId, userId),
        eq(chesscomImportJobs.id, jobId)
      )
    )
    .get();
}

export async function listChesscomImportJobs(
  userId: string
): Promise<
  Pick<
    ChesscomImportJob,
    | 'id'
    | 'sourceUsername'
    | 'status'
    | 'analysisStatus'
    | 'importedGames'
    | 'totalGames'
    | 'totalPositions'
    | 'processedPositions'
    | 'candidateCount'
    | 'skippedCount'
    | 'failureCount'
    | 'error'
    | 'createdAt'
  >[]
> {
  return db
    .select({
      id: chesscomImportJobs.id,
      sourceUsername: chesscomImportJobs.sourceUsername,
      status: chesscomImportJobs.status,
      analysisStatus: chesscomImportJobs.analysisStatus,
      importedGames: chesscomImportJobs.importedGames,
      totalGames: chesscomImportJobs.totalGames,
      totalPositions: chesscomImportJobs.totalPositions,
      processedPositions: chesscomImportJobs.processedPositions,
      candidateCount: chesscomImportJobs.candidateCount,
      skippedCount: chesscomImportJobs.skippedCount,
      failureCount: chesscomImportJobs.failureCount,
      error: chesscomImportJobs.error,
      createdAt: chesscomImportJobs.createdAt,
    })
    .from(chesscomImportJobs)
    .where(eq(chesscomImportJobs.userId, userId))
    .orderBy(desc(chesscomImportJobs.createdAt));
}

export async function updateChesscomImportJob(
  userId: string,
  jobId: string,
  update: ChesscomImportJobUpdate
): Promise<void> {
  await db
    .update(chesscomImportJobs)
    .set(update)
    .where(
      and(
        eq(chesscomImportJobs.userId, userId),
        eq(chesscomImportJobs.id, jobId)
      )
    );
}

export async function claimChesscomImportJob(
  userId: string,
  jobId: string
): Promise<boolean> {
  const claimed = await db
    .update(chesscomImportJobs)
    .set({ status: 'running', updatedAt: Date.now(), error: null })
    .where(
      and(
        eq(chesscomImportJobs.userId, userId),
        eq(chesscomImportJobs.id, jobId),
        inArray(chesscomImportJobs.status, [
          'queued',
          'partial',
          'paused',
          'failed',
        ])
      )
    )
    .returning({ id: chesscomImportJobs.id })
    .get();
  return Boolean(claimed);
}

export async function upsertChesscomGame(game: ChesscomGame): Promise<void> {
  await db.insert(chesscomGames).values(game).onConflictDoNothing();
}

export async function upsertChesscomGames(
  userId: string,
  jobId: string,
  games: ChesscomGame[]
): Promise<void> {
  if (games.length === 0) return;
  if (games.some((game) => game.userId !== userId)) {
    throw new Error('A Chess.com game batch must share one owner.');
  }

  for (let index = 0; index < games.length; index += 50) {
    await db
      .insert(chesscomGames)
      .values(games.slice(index, index + 50))
      .onConflictDoNothing();
  }

  const sourceUrls = [...new Set(games.map((game) => game.sourceUrl))];
  const storedGames = await db
    .select({ id: chesscomGames.id })
    .from(chesscomGames)
    .where(
      and(
        eq(chesscomGames.userId, userId),
        inArray(chesscomGames.sourceUrl, sourceUrls)
      )
    );
  const jobGames = storedGames.map((game) => ({
    userId,
    jobId,
    gameId: game.id,
  }));
  for (let index = 0; index < jobGames.length; index += 100) {
    await db
      .insert(chesscomImportJobGames)
      .values(jobGames.slice(index, index + 100))
      .onConflictDoNothing();
  }
}

export async function listChesscomGames(
  userId: string
): Promise<(typeof chesscomGames.$inferSelect)[]> {
  return db
    .select()
    .from(chesscomGames)
    .where(eq(chesscomGames.userId, userId))
    .orderBy(desc(chesscomGames.playedAt));
}

export async function listChesscomGamesForJob(
  userId: string,
  jobId: string
): Promise<(typeof chesscomGames.$inferSelect)[]> {
  const rows = await db
    .select(getTableColumns(chesscomGames))
    .from(chesscomGames)
    .innerJoin(
      chesscomImportJobGames,
      and(
        eq(chesscomGames.userId, chesscomImportJobGames.userId),
        eq(chesscomGames.id, chesscomImportJobGames.gameId)
      )
    )
    .where(
      and(
        eq(chesscomGames.userId, userId),
        eq(chesscomImportJobGames.userId, userId),
        eq(chesscomImportJobGames.jobId, jobId)
      )
    )
    .orderBy(desc(chesscomGames.playedAt));
  return rows;
}

export async function updateChesscomGameAnalysisStatus(
  userId: string,
  gameId: string,
  status: string,
  skipReason: string | null = null
): Promise<void> {
  await db
    .update(chesscomGames)
    .set({ analysisStatus: status, skipReason })
    .where(and(eq(chesscomGames.userId, userId), eq(chesscomGames.id, gameId)));
}

export async function getChesscomGameBySourceUrl(
  userId: string,
  sourceUrl: string
): Promise<typeof chesscomGames.$inferSelect | undefined> {
  return db
    .select()
    .from(chesscomGames)
    .where(
      and(
        eq(chesscomGames.userId, userId),
        eq(chesscomGames.sourceUrl, sourceUrl)
      )
    )
    .get();
}

export async function detachChesscomGamesOutsideImport(
  userId: string,
  jobId: string,
  retainedSourceUrls: string[]
): Promise<void> {
  const linkedGames = await db
    .select({
      gameId: chesscomImportJobGames.gameId,
      sourceUrl: chesscomGames.sourceUrl,
    })
    .from(chesscomImportJobGames)
    .innerJoin(
      chesscomGames,
      and(
        eq(chesscomGames.userId, chesscomImportJobGames.userId),
        eq(chesscomGames.id, chesscomImportJobGames.gameId)
      )
    )
    .where(
      and(
        eq(chesscomImportJobGames.userId, userId),
        eq(chesscomImportJobGames.jobId, jobId)
      )
    );
  const retained = new Set(retainedSourceUrls);
  const removeGameIds = linkedGames
    .filter((game) => !retained.has(game.sourceUrl))
    .map((game) => game.gameId);
  for (let index = 0; index < removeGameIds.length; index += 100) {
    await db
      .delete(chesscomImportJobGames)
      .where(
        and(
          eq(chesscomImportJobGames.userId, userId),
          eq(chesscomImportJobGames.jobId, jobId),
          inArray(
            chesscomImportJobGames.gameId,
            removeGameIds.slice(index, index + 100)
          )
        )
      );
  }
}

export async function createChesscomAnalysisPositions(
  positions: (typeof chesscomAnalysisPositions.$inferInsert)[]
): Promise<void> {
  if (positions.length === 0) return;
  for (let index = 0; index < positions.length; index += 50) {
    await db
      .insert(chesscomAnalysisPositions)
      .values(positions.slice(index, index + 50))
      .onConflictDoNothing();
  }
}

export async function listPendingChesscomAnalysisPositions(
  userId: string,
  limit = 100
): Promise<ChesscomAnalysisPosition[]> {
  return db
    .select()
    .from(chesscomAnalysisPositions)
    .where(
      and(
        eq(chesscomAnalysisPositions.userId, userId),
        eq(chesscomAnalysisPositions.status, 'pending')
      )
    )
    .orderBy(
      asc(chesscomAnalysisPositions.gameId),
      asc(chesscomAnalysisPositions.ply)
    )
    .limit(limit);
}

export async function listJobPendingChesscomAnalysisPositions(
  userId: string,
  jobId: string,
  limit = 10
) {
  return db
    .select({
      id: chesscomAnalysisPositions.id,
      gameId: chesscomAnalysisPositions.gameId,
      ply: chesscomAnalysisPositions.ply,
      fen: chesscomAnalysisPositions.fen,
      playedMove: chesscomAnalysisPositions.playedMove,
    })
    .from(chesscomAnalysisPositions)
    .innerJoin(
      chesscomGames,
      eq(chesscomAnalysisPositions.gameId, chesscomGames.id)
    )
    .innerJoin(
      chesscomImportJobGames,
      and(
        eq(chesscomImportJobGames.userId, userId),
        eq(chesscomImportJobGames.gameId, chesscomGames.id)
      )
    )
    .where(
      and(
        eq(chesscomAnalysisPositions.userId, userId),
        eq(chesscomGames.userId, userId),
        eq(chesscomImportJobGames.jobId, jobId),
        eq(chesscomAnalysisPositions.status, 'pending')
      )
    )
    .orderBy(asc(chesscomGames.playedAt), asc(chesscomAnalysisPositions.ply))
    .limit(limit);
}

export async function getChesscomJobAnalysisStats(
  userId: string,
  jobId: string
) {
  const positionCounts = await db
    .select({
      totalPositions: sql<number>`count(*)`,
      processedPositions: sql<number>`coalesce(sum(case when ${chesscomAnalysisPositions.status} = 'completed' then 1 else 0 end), 0)`,
      pendingPositions: sql<number>`coalesce(sum(case when ${chesscomAnalysisPositions.status} = 'pending' then 1 else 0 end), 0)`,
      failureCount: sql<number>`coalesce(sum(case when ${chesscomAnalysisPositions.status} = 'failed' then 1 else 0 end), 0)`,
    })
    .from(chesscomAnalysisPositions)
    .innerJoin(
      chesscomGames,
      eq(chesscomAnalysisPositions.gameId, chesscomGames.id)
    )
    .innerJoin(
      chesscomImportJobGames,
      and(
        eq(chesscomImportJobGames.userId, userId),
        eq(chesscomImportJobGames.gameId, chesscomGames.id)
      )
    )
    .where(
      and(
        eq(chesscomAnalysisPositions.userId, userId),
        eq(chesscomGames.userId, userId),
        eq(chesscomImportJobGames.jobId, jobId)
      )
    )
    .get();
  const candidateCounts = await db
    .select({ candidateCount: sql<number>`count(*)` })
    .from(chesscomPuzzles)
    .innerJoin(
      chesscomImportJobGames,
      and(
        eq(chesscomImportJobGames.userId, userId),
        eq(chesscomImportJobGames.gameId, chesscomPuzzles.gameId)
      )
    )
    .where(
      and(
        eq(chesscomPuzzles.userId, userId),
        eq(chesscomImportJobGames.jobId, jobId)
      )
    )
    .get();
  return {
    totalPositions: positionCounts?.totalPositions ?? 0,
    processedPositions: positionCounts?.processedPositions ?? 0,
    pendingPositions: positionCounts?.pendingPositions ?? 0,
    failureCount: positionCounts?.failureCount ?? 0,
    candidateCount: candidateCounts?.candidateCount ?? 0,
  };
}

export async function getJobChesscomAnalysisPosition(
  userId: string,
  jobId: string,
  positionId: string
) {
  return db
    .select({
      id: chesscomAnalysisPositions.id,
      gameId: chesscomAnalysisPositions.gameId,
      ply: chesscomAnalysisPositions.ply,
      fen: chesscomAnalysisPositions.fen,
      playedMove: chesscomAnalysisPositions.playedMove,
    })
    .from(chesscomAnalysisPositions)
    .innerJoin(
      chesscomGames,
      eq(chesscomAnalysisPositions.gameId, chesscomGames.id)
    )
    .innerJoin(
      chesscomImportJobGames,
      and(
        eq(chesscomImportJobGames.userId, userId),
        eq(chesscomImportJobGames.gameId, chesscomGames.id)
      )
    )
    .where(
      and(
        eq(chesscomAnalysisPositions.userId, userId),
        eq(chesscomAnalysisPositions.id, positionId),
        eq(chesscomGames.userId, userId),
        eq(chesscomImportJobGames.jobId, jobId)
      )
    )
    .get();
}

export async function saveChesscomAnalysisResult(
  userId: string,
  jobId: string,
  positionId: string,
  result: {
    bestMove: string;
    bestScore: string;
    playedScore: string;
    lossCentipawns: number;
  },
  candidate?: ChesscomAnalysisCandidate
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const position = await tx
      .select({
        status: chesscomAnalysisPositions.status,
        gameId: chesscomGames.id,
        sourceUrl: chesscomGames.sourceUrl,
        ply: chesscomAnalysisPositions.ply,
        fen: chesscomAnalysisPositions.fen,
      })
      .from(chesscomAnalysisPositions)
      .innerJoin(
        chesscomGames,
        eq(chesscomAnalysisPositions.gameId, chesscomGames.id)
      )
      .innerJoin(
        chesscomImportJobGames,
        and(
          eq(chesscomImportJobGames.userId, userId),
          eq(chesscomImportJobGames.gameId, chesscomGames.id)
        )
      )
      .where(
        and(
          eq(chesscomAnalysisPositions.userId, userId),
          eq(chesscomAnalysisPositions.id, positionId),
          eq(chesscomGames.userId, userId),
          eq(chesscomImportJobGames.jobId, jobId)
        )
      )
      .get();
    if (!position || !['pending', 'failed'].includes(position.status)) {
      return false;
    }

    const wasFailed = position.status === 'failed';
    const updatedPosition = await tx
      .update(chesscomAnalysisPositions)
      .set({
        status: 'completed',
        bestMove: result.bestMove,
        bestScore: result.bestScore,
        playedScore: result.playedScore,
        lossCentipawns: result.lossCentipawns,
        error: null,
        processedAt: Date.now(),
      })
      .where(
        and(
          eq(chesscomAnalysisPositions.userId, userId),
          eq(chesscomAnalysisPositions.id, positionId),
          inArray(chesscomAnalysisPositions.status, ['pending', 'failed'])
        )
      )
      .returning({ id: chesscomAnalysisPositions.id })
      .get();
    if (!updatedPosition) return false;

    let insertedPuzzle = false;
    if (candidate) {
      const inserted = await tx
        .insert(chesscomPuzzles)
        .values({
          id: candidate.id,
          userId,
          gameId: position.gameId,
          sourceGameUrl: position.sourceUrl,
          ply: position.ply,
          fen: position.fen,
          solutionLine: candidate.solutionLine,
          estimatedRating: candidate.estimatedRating,
          stockfishVersion: candidate.stockfishVersion,
          analysisSettings: candidate.analysisSettings,
          scoreLoss: candidate.scoreLoss,
          ratingFormulaVersion: candidate.ratingFormulaVersion,
          createdAt: Date.now(),
        })
        .onConflictDoNothing({
          target: [
            chesscomPuzzles.userId,
            chesscomPuzzles.sourceGameUrl,
            chesscomPuzzles.ply,
          ],
        })
        .returning({ id: chesscomPuzzles.id })
        .get();
      insertedPuzzle = Boolean(inserted);
    }

    await tx
      .update(chesscomImportJobs)
      .set({
        processedPositions: sql`${chesscomImportJobs.processedPositions} + 1`,
        ...(wasFailed
          ? {
              failureCount: sql`max(${chesscomImportJobs.failureCount} - 1, 0)`,
            }
          : {}),
        ...(insertedPuzzle
          ? {
              candidateCount: sql`${chesscomImportJobs.candidateCount} + 1`,
            }
          : {}),
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(chesscomImportJobs.userId, userId),
          eq(chesscomImportJobs.id, jobId)
        )
      );
    return true;
  });
}

export async function saveChesscomAnalysisFailure(
  userId: string,
  jobId: string,
  positionId: string,
  error: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const ownedPosition = await tx
      .select({ status: chesscomAnalysisPositions.status })
      .from(chesscomAnalysisPositions)
      .innerJoin(
        chesscomGames,
        eq(chesscomAnalysisPositions.gameId, chesscomGames.id)
      )
      .innerJoin(
        chesscomImportJobGames,
        and(
          eq(chesscomImportJobGames.userId, userId),
          eq(chesscomImportJobGames.gameId, chesscomGames.id)
        )
      )
      .where(
        and(
          eq(chesscomAnalysisPositions.userId, userId),
          eq(chesscomAnalysisPositions.id, positionId),
          eq(chesscomGames.userId, userId),
          eq(chesscomImportJobGames.jobId, jobId)
        )
      )
      .get();
    if (!ownedPosition || ownedPosition.status !== 'pending') return false;

    const updatedPosition = await tx
      .update(chesscomAnalysisPositions)
      .set({ status: 'failed', error: error.slice(0, 500), processedAt: null })
      .where(
        and(
          eq(chesscomAnalysisPositions.userId, userId),
          eq(chesscomAnalysisPositions.id, positionId),
          eq(chesscomAnalysisPositions.status, 'pending')
        )
      )
      .returning({ id: chesscomAnalysisPositions.id })
      .get();
    if (!updatedPosition) return false;

    await tx
      .update(chesscomImportJobs)
      .set({
        failureCount: sql`${chesscomImportJobs.failureCount} + 1`,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(chesscomImportJobs.userId, userId),
          eq(chesscomImportJobs.id, jobId)
        )
      );
    return true;
  });
}

export async function retryChesscomAnalysisFailures(
  userId: string,
  jobId: string
): Promise<number> {
  return db.transaction(async (tx) => {
    const retried = await tx
      .update(chesscomAnalysisPositions)
      .set({ status: 'pending', error: null, processedAt: null })
      .where(
        and(
          eq(chesscomAnalysisPositions.userId, userId),
          eq(chesscomAnalysisPositions.status, 'failed'),
          exists(
            tx
              .select({ one: sql`1` })
              .from(chesscomImportJobGames)
              .where(
                and(
                  eq(chesscomImportJobGames.userId, userId),
                  eq(chesscomImportJobGames.jobId, jobId),
                  eq(
                    chesscomImportJobGames.gameId,
                    chesscomAnalysisPositions.gameId
                  )
                )
              )
          )
        )
      )
      .returning({ id: chesscomAnalysisPositions.id })
      .all();
    if (retried.length > 0) {
      await tx
        .update(chesscomImportJobs)
        .set({
          failureCount: sql`max(${chesscomImportJobs.failureCount} - ${retried.length}, 0)`,
          updatedAt: Date.now(),
        })
        .where(
          and(
            eq(chesscomImportJobs.userId, userId),
            eq(chesscomImportJobs.id, jobId)
          )
        );
    }
    return retried.length;
  });
}

export async function updateChesscomAnalysisPosition(
  userId: string,
  positionId: string,
  update: Partial<
    Pick<
      ChesscomAnalysisPosition,
      | 'status'
      | 'bestMove'
      | 'bestScore'
      | 'playedScore'
      | 'lossCentipawns'
      | 'error'
      | 'processedAt'
    >
  >
): Promise<void> {
  await db
    .update(chesscomAnalysisPositions)
    .set(update)
    .where(
      and(
        eq(chesscomAnalysisPositions.userId, userId),
        eq(chesscomAnalysisPositions.id, positionId)
      )
    );
}

export async function createChesscomPuzzle(
  puzzle: ChesscomPuzzle
): Promise<void> {
  await db
    .insert(chesscomPuzzles)
    .values(puzzle)
    .onConflictDoNothing({
      target: [
        chesscomPuzzles.userId,
        chesscomPuzzles.sourceGameUrl,
        chesscomPuzzles.ply,
      ],
    });
}

export async function listChesscomPuzzles(
  userId: string
): Promise<(typeof chesscomPuzzles.$inferSelect)[]> {
  return db
    .select()
    .from(chesscomPuzzles)
    .where(eq(chesscomPuzzles.userId, userId))
    .orderBy(asc(chesscomPuzzles.estimatedRating));
}

export async function getChesscomPuzzle(
  userId: string,
  puzzleId: string
): Promise<typeof chesscomPuzzles.$inferSelect | undefined> {
  return db
    .select()
    .from(chesscomPuzzles)
    .where(
      and(eq(chesscomPuzzles.userId, userId), eq(chesscomPuzzles.id, puzzleId))
    )
    .get();
}

export async function findNextChesscomPuzzle(
  userId: string,
  rating: number,
  now = Date.now()
) {
  return db
    .select()
    .from(chesscomPuzzles)
    .where(
      and(
        eq(chesscomPuzzles.userId, userId),
        or(
          notExists(
            db
              .select({ one: sql`1` })
              .from(chesscomPuzzleProgress)
              .where(
                and(
                  eq(chesscomPuzzleProgress.userId, userId),
                  eq(chesscomPuzzleProgress.puzzleId, chesscomPuzzles.id)
                )
              )
          ),
          exists(
            db
              .select({ one: sql`1` })
              .from(chesscomPuzzleProgress)
              .where(
                and(
                  eq(chesscomPuzzleProgress.userId, userId),
                  eq(chesscomPuzzleProgress.puzzleId, chesscomPuzzles.id),
                  lte(chesscomPuzzleProgress.reviewDueAt, now)
                )
              )
          )
        )
      )
    )
    .orderBy(sql`abs(${chesscomPuzzles.estimatedRating} - ${rating})`)
    .limit(1)
    .get();
}

export async function submitChesscomPuzzleAttempt(
  userId: string,
  puzzleId: string,
  success: boolean,
  now = Date.now()
): Promise<
  | {
      rating: StoredRating;
      sourceGameUrl: string;
      puzzleRating: number;
      solveOrder: number;
      reviewDueAt: number;
    }
  | undefined
> {
  return db.transaction(async (tx) => {
    const puzzle = await tx
      .select()
      .from(chesscomPuzzles)
      .where(
        and(
          eq(chesscomPuzzles.userId, userId),
          eq(chesscomPuzzles.id, puzzleId)
        )
      )
      .get();
    if (!puzzle) return undefined;

    const previousProgress = await tx
      .select()
      .from(chesscomPuzzleProgress)
      .where(
        and(
          eq(chesscomPuzzleProgress.userId, userId),
          eq(chesscomPuzzleProgress.puzzleId, puzzleId)
        )
      )
      .get();
    if (
      previousProgress?.reviewDueAt !== null &&
      previousProgress?.reviewDueAt !== undefined &&
      previousProgress.reviewDueAt > now
    ) {
      return undefined;
    }

    const storedRating = await tx
      .select()
      .from(chesscomRatings)
      .where(eq(chesscomRatings.userId, userId))
      .get();
    const oldRating = storedRating ?? {
      userId,
      ...CHESSCOM_INITIAL_RATING,
    };
    const userGlicko = new GlickoRating(
      oldRating.rating,
      oldRating.ratingDeviation,
      oldRating.volatility,
      oldRating.numberOfResults
    );
    const puzzleGlicko = new GlickoRating(
      puzzle.estimatedRating,
      80,
      CHESSCOM_INITIAL_RATING.volatility,
      0
    );
    const result = success
      ? new GameResult(userGlicko, puzzleGlicko)
      : new GameResult(puzzleGlicko, userGlicko);
    new RatingCalculator().updateRatings(result);

    const rating = {
      rating: userGlicko.rating,
      ratingDeviation: userGlicko.ratingDeviation,
      volatility: userGlicko.volatility,
      numberOfResults: userGlicko.numberOfResults,
    };
    await tx
      .insert(chesscomRatings)
      .values({ userId, ...rating })
      .onConflictDoUpdate({
        target: chesscomRatings.userId,
        set: rating,
      });

    const solveOrder =
      previousProgress?.solveOrder ??
      (
        await tx
          .select({
            nextOrder: sql<number>`coalesce(max(${chesscomPuzzleProgress.solveOrder}), -1) + 1`,
          })
          .from(chesscomPuzzleProgress)
          .where(eq(chesscomPuzzleProgress.userId, userId))
      )[0].nextOrder;
    const reviewDueAt = now + (success ? 7 : 1) * 24 * 60 * 60 * 1000;
    await tx
      .insert(chesscomPuzzleProgress)
      .values({
        userId,
        puzzleId,
        solveOrder,
        solved: success ? 1 : 0,
        lastResult: success ? 1 : 0,
        reviewDueAt,
        reviewState: success ? 'review' : 'retry',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          chesscomPuzzleProgress.userId,
          chesscomPuzzleProgress.puzzleId,
        ],
        set: {
          solved: success ? 1 : 0,
          lastResult: success ? 1 : 0,
          reviewDueAt,
          reviewState: success ? 'review' : 'retry',
          updatedAt: now,
        },
      });

    await tx.insert(chesscomRatingHistory).values({
      userId,
      ...rating,
      createdAt: now,
    });
    return {
      rating,
      sourceGameUrl: puzzle.sourceGameUrl,
      puzzleRating: puzzle.estimatedRating,
      solveOrder,
      reviewDueAt,
    };
  });
}

export async function getChesscomPuzzleProgress(
  userId: string,
  puzzleId: string
): Promise<typeof chesscomPuzzleProgress.$inferSelect | undefined> {
  return db
    .select()
    .from(chesscomPuzzleProgress)
    .where(
      and(
        eq(chesscomPuzzleProgress.userId, userId),
        eq(chesscomPuzzleProgress.puzzleId, puzzleId)
      )
    )
    .get();
}

export async function saveChesscomPuzzleProgress(
  progress: typeof chesscomPuzzleProgress.$inferInsert
): Promise<void> {
  await db
    .insert(chesscomPuzzleProgress)
    .values(progress)
    .onConflictDoUpdate({
      target: [chesscomPuzzleProgress.userId, chesscomPuzzleProgress.puzzleId],
      set: {
        solved: progress.solved,
        lastResult: progress.lastResult,
        reviewDueAt: progress.reviewDueAt,
        reviewState: progress.reviewState,
        updatedAt: progress.updatedAt,
      },
    });
}

export async function listChesscomPuzzleProgressDue(
  userId: string,
  now = Date.now()
): Promise<(typeof chesscomPuzzleProgress.$inferSelect)[]> {
  return db
    .select()
    .from(chesscomPuzzleProgress)
    .where(
      and(
        eq(chesscomPuzzleProgress.userId, userId),
        lt(chesscomPuzzleProgress.reviewDueAt, now)
      )
    )
    .orderBy(asc(chesscomPuzzleProgress.reviewDueAt));
}

export async function getChesscomRating(
  userId: string
): Promise<typeof chesscomRatings.$inferSelect | undefined> {
  return db
    .select()
    .from(chesscomRatings)
    .where(eq(chesscomRatings.userId, userId))
    .get();
}

export async function saveChesscomRating(
  rating: typeof chesscomRatings.$inferInsert
): Promise<void> {
  await db
    .insert(chesscomRatings)
    .values(rating)
    .onConflictDoUpdate({
      target: chesscomRatings.userId,
      set: {
        rating: rating.rating,
        ratingDeviation: rating.ratingDeviation,
        volatility: rating.volatility,
        numberOfResults: rating.numberOfResults,
      },
    });
}

export async function addChesscomRatingHistory(
  rating: Omit<typeof chesscomRatingHistory.$inferInsert, 'id'>
): Promise<void> {
  await db.insert(chesscomRatingHistory).values(rating);
}

export async function listChesscomRatingHistory(
  userId: string
): Promise<(typeof chesscomRatingHistory.$inferSelect)[]> {
  return db
    .select()
    .from(chesscomRatingHistory)
    .where(eq(chesscomRatingHistory.userId, userId))
    .orderBy(asc(chesscomRatingHistory.createdAt));
}

export async function deleteChesscomData(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(chesscomPuzzleProgress)
      .where(eq(chesscomPuzzleProgress.userId, userId));
    await tx
      .delete(chesscomAnalysisPositions)
      .where(eq(chesscomAnalysisPositions.userId, userId));
    await tx.delete(chesscomPuzzles).where(eq(chesscomPuzzles.userId, userId));
    await tx.delete(chesscomGames).where(eq(chesscomGames.userId, userId));
    await tx
      .delete(chesscomImportJobs)
      .where(eq(chesscomImportJobs.userId, userId));
    await tx.delete(chesscomRatings).where(eq(chesscomRatings.userId, userId));
    await tx
      .delete(chesscomRatingHistory)
      .where(eq(chesscomRatingHistory.userId, userId));
  });
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
