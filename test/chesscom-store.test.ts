import { randomUUID } from 'node:crypto';
import { client, dbConnect } from '@/lib/db';
import {
  createChesscomImportJob,
  createChesscomAnalysisPositions,
  createChesscomPuzzle,
  addChesscomRatingHistory,
  createInitialUserData,
  claimChesscomImportJob,
  createUser,
  deleteChesscomData,
  findNextChesscomPuzzle,
  getChesscomPuzzleProgress,
  getRating,
  getChesscomRating,
  getChesscomImportJob,
  getChesscomJobAnalysisStats,
  getChesscomUsername,
  listChesscomGames,
  listChesscomGamesForJob,
  listPendingChesscomAnalysisPositions,
  listChesscomRatingHistory,
  listChesscomPuzzles,
  saveChesscomRating,
  saveChesscomUsername,
  submitChesscomPuzzleAttempt,
  upsertChesscomGame,
  upsertChesscomGames,
} from '@/lib/store';

describe('Chess.com feature store', () => {
  const suffix = randomUUID();
  const ownerId = `chesscom-owner-${suffix}`;
  const ownerUsername = `owner-${suffix}`;
  const otherUserId = `chesscom-other-${suffix}`;
  const sourceUrl = `https://www.chess.com/game/live/${suffix}`;
  const gameId = `chesscom-game-${suffix}`;
  const jobId = `chesscom-job-${suffix}`;
  const reimportJobId = `chesscom-reimport-job-${suffix}`;
  const otherJobId = `chesscom-other-job-${suffix}`;
  const puzzleId = `chesscom-puzzle-${suffix}`;
  const otherGameId = `chesscom-other-game-${suffix}`;
  const otherPuzzleId = `chesscom-other-puzzle-${suffix}`;

  beforeAll(async () => {
    await dbConnect();
    await createUser({ id: ownerId, username: ownerUsername });
    await createUser({ id: otherUserId, username: `other-${suffix}` });
  });

  afterAll(async () => {
    await deleteChesscomData(ownerId);
    await deleteChesscomData(otherUserId);
    await client.batch(
      [
        {
          sql: 'DELETE FROM initial_ratings WHERE username = ?',
          args: [ownerUsername],
        },
        {
          sql: 'DELETE FROM ratings WHERE username = ?',
          args: [ownerUsername],
        },
        { sql: 'DELETE FROM users WHERE id = ?', args: [ownerId] },
        { sql: 'DELETE FROM users WHERE id = ?', args: [otherUserId] },
      ],
      'write'
    );
    await client.close();
  });

  it('stores the setting and scopes jobs and games to their owner', async () => {
    await saveChesscomUsername(ownerId, 'ConfiguredPlayer');
    expect(await getChesscomUsername(ownerId)).toBe('ConfiguredPlayer');
    expect(await getChesscomUsername(otherUserId)).toBeNull();

    await createChesscomImportJob({
      id: jobId,
      userId: ownerId,
      sourceUsername: 'ConfiguredPlayer',
      status: 'queued',
      windowStart: 1_700_000_000_000,
      windowEnd: 1_700_000_100_000,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    await createChesscomImportJob({
      id: otherJobId,
      userId: otherUserId,
      sourceUsername: 'OtherPlayer',
      status: 'queued',
      windowStart: 1_700_000_000_000,
      windowEnd: 1_700_000_100_000,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    await createChesscomImportJob({
      id: reimportJobId,
      userId: ownerId,
      sourceUsername: 'ChangedConfiguredPlayer',
      status: 'queued',
      windowStart: 1_700_000_000_000,
      windowEnd: 1_700_000_100_000,
      createdAt: 1_700_000_000_001,
      updatedAt: 1_700_000_000_001,
    });
    expect(await getChesscomImportJob(ownerId, jobId)).toMatchObject({
      id: jobId,
      userId: ownerId,
      status: 'queued',
      totalGames: 0,
    });
    expect(await getChesscomImportJob(otherUserId, jobId)).toBeUndefined();
    expect(await claimChesscomImportJob(ownerId, jobId)).toBe(true);
    expect(await claimChesscomImportJob(ownerId, jobId)).toBe(false);

    const game = {
      id: gameId,
      userId: ownerId,
      sourceUsername: 'ConfiguredPlayer',
      sourceUrl,
      playedAt: 1_700_000_000_000,
      whiteUsername: 'ConfiguredPlayer',
      blackUsername: 'Opponent',
      whiteRating: 1500,
      blackRating: 1600,
      timeClass: 'rapid',
      rules: 'chess',
      result: 'win',
      pgn: '[Event "Test"]',
      createdAt: 1_700_000_000_000,
    };
    await upsertChesscomGames(ownerId, jobId, [game]);
    await expect(
      upsertChesscomGames(ownerId, otherJobId, [
        { ...game, id: `${gameId}-cross-owner` },
      ])
    ).rejects.toThrow();
    await upsertChesscomGames(ownerId, jobId, [
      { ...game, id: `${gameId}-retry`, sourceUsername: 'changed-account' },
    ]);
    await upsertChesscomGames(ownerId, reimportJobId, [
      { ...game, id: `${gameId}-reimport`, sourceUsername: 'changed-account' },
    ]);

    expect(await listChesscomGames(ownerId)).toHaveLength(1);
    expect((await listChesscomGames(ownerId))[0].sourceUsername).toBe(
      'ConfiguredPlayer'
    );
    expect(await listChesscomGamesForJob(ownerId, jobId)).toHaveLength(1);
    expect(await listChesscomGamesForJob(ownerId, reimportJobId)).toHaveLength(
      1
    );
    expect(await listChesscomGamesForJob(otherUserId, jobId)).toHaveLength(0);
    expect(await listChesscomGames(otherUserId)).toHaveLength(0);
  });

  it('is idempotent for a generated game/ply and deletes only the owner data', async () => {
    await upsertChesscomGame({
      id: otherGameId,
      userId: otherUserId,
      sourceUsername: 'OtherPlayer',
      sourceUrl: `https://www.chess.com/game/live/other-${suffix}`,
      playedAt: 1_700_000_000_000,
      whiteUsername: 'OtherPlayer',
      blackUsername: 'Opponent',
      whiteRating: 1300,
      blackRating: 1400,
      timeClass: 'rapid',
      rules: 'chess',
      result: 'win',
      pgn: '[Event "Other test"]',
      createdAt: 1_700_000_000_000,
    });

    const puzzle = {
      id: puzzleId,
      userId: ownerId,
      gameId,
      sourceGameUrl: sourceUrl,
      ply: 17,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      solutionLine: 'e2e4 e7e5',
      estimatedRating: 1500,
      stockfishVersion: '19.0.1',
      analysisSettings: '{"depth":12,"threads":1,"hashMb":16}',
      scoreLoss: '{"kind":"centipawns","value":150}',
      ratingFormulaVersion: 'stockfish-feature-v1',
      createdAt: 1_700_000_000_000,
    };
    await createChesscomPuzzle(puzzle);
    await createChesscomPuzzle({ ...puzzle, id: `${puzzleId}-retry` });
    await expect(
      createChesscomPuzzle({
        ...puzzle,
        id: `${puzzleId}-cross-owner`,
        gameId: otherGameId,
        sourceGameUrl: `https://www.chess.com/game/live/cross-owner-${suffix}`,
      })
    ).rejects.toThrow();
    await createChesscomPuzzle({
      ...puzzle,
      id: otherPuzzleId,
      userId: otherUserId,
      gameId: otherGameId,
      sourceGameUrl: `https://www.chess.com/game/live/other-${suffix}`,
    });
    await saveChesscomRating({
      userId: ownerId,
      rating: 1500,
      ratingDeviation: 350,
      volatility: 0.06,
      numberOfResults: 0,
    });
    await saveChesscomRating({
      userId: otherUserId,
      rating: 1200,
      ratingDeviation: 200,
      volatility: 0.06,
      numberOfResults: 1,
    });
    await createInitialUserData(ownerUsername, {
      rating: 1650,
      ratingDeviation: 90,
      volatility: 0.08,
      numberOfResults: 12,
    });
    await createChesscomAnalysisPositions([
      {
        id: `owner-position-${suffix}`,
        userId: ownerId,
        gameId,
        ply: 3,
        fen: puzzle.fen,
        playedMove: 'g1f3',
        status: 'pending',
      },
      {
        id: `other-position-${suffix}`,
        userId: otherUserId,
        gameId: otherGameId,
        ply: 3,
        fen: puzzle.fen,
        playedMove: 'g1f3',
        status: 'pending',
      },
    ]);
    await addChesscomRatingHistory({
      userId: otherUserId,
      rating: 1200,
      ratingDeviation: 200,
      volatility: 0.06,
      numberOfResults: 1,
      createdAt: 1_700_000_000_000,
    });

    expect(await listChesscomPuzzles(ownerId)).toHaveLength(1);
    expect(await getChesscomJobAnalysisStats(ownerId, jobId)).toMatchObject({
      totalPositions: 1,
      processedPositions: 0,
      candidateCount: 1,
    });
    expect(
      await getChesscomJobAnalysisStats(ownerId, reimportJobId)
    ).toMatchObject({
      totalPositions: 1,
      processedPositions: 0,
      candidateCount: 1,
    });
    const beforeSharedRating = await getRating(ownerUsername);
    const submitted = await submitChesscomPuzzleAttempt(
      ownerId,
      puzzleId,
      true,
      1_700_000_000_000
    );
    expect(submitted).toMatchObject({
      sourceGameUrl: sourceUrl,
      solveOrder: 0,
      reviewDueAt: 1_700_604_800_000,
    });
    expect(
      await findNextChesscomPuzzle(ownerId, 1500, 1_700_000_000_001)
    ).toBeUndefined();
    expect(
      await submitChesscomPuzzleAttempt(
        ownerId,
        puzzleId,
        false,
        1_700_000_000_001
      )
    ).toBeUndefined();
    expect(await listChesscomRatingHistory(ownerId)).toHaveLength(1);
    expect(await getChesscomPuzzleProgress(ownerId, puzzleId)).toMatchObject({
      solved: 1,
      solveOrder: 0,
      reviewState: 'review',
    });
    expect(await getRating(ownerUsername)).toEqual(beforeSharedRating);

    await deleteChesscomData(ownerId);
    expect(await listChesscomGames(ownerId)).toHaveLength(0);
    expect(await listChesscomPuzzles(ownerId)).toHaveLength(0);
    expect(await getChesscomImportJob(ownerId, jobId)).toBeUndefined();
    expect(await getChesscomImportJob(ownerId, reimportJobId)).toBeUndefined();
    expect(await getChesscomRating(ownerId)).toBeUndefined();
    expect(await listChesscomRatingHistory(ownerId)).toHaveLength(0);
    expect(await getChesscomPuzzleProgress(ownerId, puzzleId)).toBeUndefined();
    expect(await listPendingChesscomAnalysisPositions(ownerId)).toHaveLength(0);
    expect(await getChesscomUsername(ownerId)).toBe('ConfiguredPlayer');
    expect(await listChesscomGames(otherUserId)).toHaveLength(1);
    expect(await listChesscomPuzzles(otherUserId)).toHaveLength(1);
    expect(
      await listPendingChesscomAnalysisPositions(otherUserId)
    ).toHaveLength(1);
    expect(await listChesscomRatingHistory(otherUserId)).toHaveLength(1);
    expect((await getChesscomRating(otherUserId))?.rating).toBe(1200);
    expect(await getRating(ownerUsername)).toEqual(beforeSharedRating);
  });
});
