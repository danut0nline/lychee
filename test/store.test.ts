import { randomUUID } from 'node:crypto';
import { dbConnect, client } from '@/lib/db';
import {
  addSolvedPuzzle,
  createUser,
  findPuzzleForRating,
  getRating,
  getSolvedPuzzleIds,
  replaceSolvedPuzzleIds,
  createInitialUserData,
  consumeActivePuzzle,
  getActivePuzzle,
  saveActivePuzzle,
} from '@/lib/store';

describe('SQL data store', () => {
  const suffix = randomUUID();
  const username = `store-test-${suffix}`;
  const puzzleId = `store-test-puzzle-${suffix}`;

  beforeAll(async () => {
    await dbConnect();
    await createUser({ id: `user-${suffix}`, username });
  });

  afterAll(async () => {
    await client.batch(
      [
        {
          sql: 'DELETE FROM puzzle_themes WHERE puzzle_id = ?',
          args: [puzzleId],
        },
        { sql: 'DELETE FROM puzzles WHERE puzzle_id = ?', args: [puzzleId] },
        {
          sql: 'DELETE FROM solved_puzzles WHERE username = ?',
          args: [username],
        },
        {
          sql: 'DELETE FROM active_puzzles WHERE username = ?',
          args: [username],
        },
        {
          sql: 'DELETE FROM initial_ratings WHERE username = ?',
          args: [username],
        },
        { sql: 'DELETE FROM ratings WHERE username = ?', args: [username] },
        { sql: 'DELETE FROM users WHERE username = ?', args: [username] },
      ],
      'write'
    );
    await client.close();
  });

  it('stores user state and performs theme-aware, solved-aware puzzle selection', async () => {
    await createInitialUserData(username, {
      rating: 1620,
      ratingDeviation: 100,
      volatility: 0.09,
      numberOfResults: 5,
    });
    expect(await getRating(username)).toEqual({
      username,
      rating: 1620,
      ratingDeviation: 100,
      volatility: 0.09,
      numberOfResults: 5,
    });

    const puzzle = {
      PuzzleId: puzzleId,
      FEN: 'test-fen',
      Moves: 'e2e4 e7e5',
      Rating: 1600,
      RatingDeviation: 80,
      Popularity: 50,
      NbPlays: 100,
      Themes: `store-test-theme-${suffix}`,
      GameUrl: 'https://lichess.org/training/test',
      hierarchy_tags: 'mate mateIn2',
    };
    await client.batch(
      [
        {
          sql: 'INSERT INTO puzzles (puzzle_id, fen, moves, rating, rating_deviation, popularity, number_of_plays, themes, game_url, hierarchy_tags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [
            puzzle.PuzzleId,
            puzzle.FEN,
            puzzle.Moves,
            puzzle.Rating,
            puzzle.RatingDeviation,
            puzzle.Popularity,
            puzzle.NbPlays,
            puzzle.Themes,
            puzzle.GameUrl,
            puzzle.hierarchy_tags,
            JSON.stringify(puzzle),
          ],
        },
        {
          sql: 'INSERT INTO puzzle_themes (puzzle_id, theme) VALUES (?, ?)',
          args: [puzzleId, `store-test-theme-${suffix}`],
        },
      ],
      'write'
    );

    expect(
      await findPuzzleForRating(
        username,
        `STORE-TEST-THEME-${suffix}`,
        1500,
        1700
      )
    ).toEqual(puzzle);

    await addSolvedPuzzle(username, puzzleId);
    await addSolvedPuzzle(username, puzzleId);
    expect(await getSolvedPuzzleIds(username)).toEqual([puzzleId]);
    expect(
      await findPuzzleForRating(
        username,
        `store-test-theme-${suffix}`,
        1500,
        1700
      )
    ).toBeUndefined();

    await replaceSolvedPuzzleIds(username, [`second-${suffix}`, puzzleId]);
    expect(await getSolvedPuzzleIds(username)).toEqual([
      `second-${suffix}`,
      puzzleId,
    ]);

    await saveActivePuzzle(username, puzzle, undefined, '');
    expect(await getActivePuzzle(username)).toEqual({
      puzzle,
      reviewee: undefined,
      groupId: '',
    });
    expect(await consumeActivePuzzle(username)).toEqual({
      puzzle,
      reviewee: undefined,
      groupId: '',
    });
    expect(await consumeActivePuzzle(username)).toBeUndefined();
  });
});
