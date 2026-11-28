import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { schema } from './schema';

const configuredDatabaseUrl = process.env.TURSO_DATABASE_URL;

if (!configuredDatabaseUrl && process.env.NODE_ENV === 'production') {
  throw new Error(
    'Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for remote Turso) in production.'
  );
}

if (process.env.VERCEL && configuredDatabaseUrl?.startsWith('file:')) {
  throw new Error('Vercel deployments require a remote Turso/libSQL database.');
}

const databaseUrl = configuredDatabaseUrl || 'file:./lychee.db';

const client =
  globalThis.__lycheeLibsqlClient ??
  (globalThis.__lycheeLibsqlClient = createClient({
    url: databaseUrl,
    ...(process.env.TURSO_AUTH_TOKEN
      ? { authToken: process.env.TURSO_AUTH_TOKEN }
      : {}),
  }));

export const db = drizzle(client, { schema });

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL UNIQUE,
    chesscom_username TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id)',
  `CREATE TABLE IF NOT EXISTS ratings (
    username TEXT PRIMARY KEY NOT NULL,
    rating REAL NOT NULL,
    rating_deviation REAL NOT NULL,
    volatility REAL NOT NULL,
    number_of_results INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS initial_ratings (
    username TEXT PRIMARY KEY NOT NULL,
    rating REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS solved_puzzles (
    username TEXT NOT NULL,
    puzzle_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (username, puzzle_id)
  )`,
  'CREATE INDEX IF NOT EXISTS solved_puzzles_order_idx ON solved_puzzles(username, position)',
  `CREATE TABLE IF NOT EXISTS rating_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT,
    username TEXT NOT NULL,
    theme TEXT NOT NULL,
    rating REAL NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS rating_history_user_theme_time_idx ON rating_history(username, theme, created_at)',
  `CREATE TABLE IF NOT EXISTS user_theme_ratings (
    username TEXT NOT NULL,
    theme TEXT NOT NULL,
    rating REAL NOT NULL,
    rating_deviation REAL NOT NULL,
    volatility REAL NOT NULL,
    number_of_results INTEGER NOT NULL,
    PRIMARY KEY (username, theme)
  )`,
  'CREATE INDEX IF NOT EXISTS user_theme_ratings_username_idx ON user_theme_ratings(username)',
  `CREATE TABLE IF NOT EXISTS theme_times (
    username TEXT NOT NULL,
    theme TEXT NOT NULL,
    time REAL NOT NULL,
    PRIMARY KEY (username, theme)
  )`,
  `CREATE TABLE IF NOT EXISTS active_puzzles (
    username TEXT PRIMARY KEY NOT NULL,
    puzzle TEXT NOT NULL,
    reviewee TEXT,
    group_id TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS leitner_reviews (
    username TEXT NOT NULL,
    group_id TEXT NOT NULL,
    box_a TEXT NOT NULL,
    box_b TEXT NOT NULL,
    PRIMARY KEY (username, group_id)
  )`,
  'CREATE INDEX IF NOT EXISTS leitner_reviews_username_idx ON leitner_reviews(username)',
  `CREATE TABLE IF NOT EXISTS recent_groups (
    username TEXT NOT NULL,
    group_id TEXT NOT NULL,
    last_used INTEGER NOT NULL,
    PRIMARY KEY (username, group_id)
  )`,
  'CREATE INDEX IF NOT EXISTS recent_groups_last_used_idx ON recent_groups(username, last_used)',
  `CREATE TABLE IF NOT EXISTS last_batches (
    username TEXT PRIMARY KEY NOT NULL,
    batch TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS similarity_caches (
    puzzle_id TEXT PRIMARY KEY NOT NULL,
    cache TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS puzzles (
    puzzle_id TEXT PRIMARY KEY NOT NULL,
    fen TEXT NOT NULL,
    moves TEXT NOT NULL,
    rating INTEGER NOT NULL,
    rating_deviation INTEGER NOT NULL,
    popularity INTEGER NOT NULL,
    number_of_plays INTEGER NOT NULL,
    themes TEXT NOT NULL,
    game_url TEXT NOT NULL,
    hierarchy_tags TEXT NOT NULL,
    data TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS puzzles_rating_idx ON puzzles(rating)',
  `CREATE TABLE IF NOT EXISTS puzzle_themes (
    puzzle_id TEXT NOT NULL REFERENCES puzzles(puzzle_id) ON DELETE CASCADE,
    theme TEXT NOT NULL,
    PRIMARY KEY (puzzle_id, theme)
  )`,
  'CREATE INDEX IF NOT EXISTS puzzle_themes_theme_idx ON puzzle_themes(theme, puzzle_id)',
  `CREATE TABLE IF NOT EXISTS chesscom_import_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_username TEXT NOT NULL,
    status TEXT NOT NULL,
    analysis_status TEXT NOT NULL DEFAULT 'idle',
    window_start INTEGER NOT NULL,
    window_end INTEGER NOT NULL,
    total_games INTEGER NOT NULL DEFAULT 0,
    imported_games INTEGER NOT NULL DEFAULT 0,
    total_positions INTEGER NOT NULL DEFAULT 0,
    processed_positions INTEGER NOT NULL DEFAULT 0,
    candidate_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    checkpoint TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS chesscom_import_jobs_user_id_unique ON chesscom_import_jobs(user_id, id)',
  'CREATE INDEX IF NOT EXISTS chesscom_import_jobs_user_created_idx ON chesscom_import_jobs(user_id, created_at)',
  `CREATE TABLE IF NOT EXISTS chesscom_games (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_username TEXT NOT NULL,
    source_url TEXT NOT NULL,
    played_at INTEGER NOT NULL,
    white_username TEXT NOT NULL,
    black_username TEXT NOT NULL,
    white_rating INTEGER,
    black_rating INTEGER,
    time_class TEXT,
    rules TEXT NOT NULL,
    result TEXT NOT NULL,
    pgn TEXT NOT NULL,
    analysis_status TEXT NOT NULL DEFAULT 'pending',
    skip_reason TEXT,
    created_at INTEGER NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS chesscom_games_user_id_unique ON chesscom_games(user_id, id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS chesscom_games_user_source_url_unique ON chesscom_games(user_id, source_url)',
  'CREATE INDEX IF NOT EXISTS chesscom_games_user_played_at_idx ON chesscom_games(user_id, played_at)',
  `CREATE TABLE IF NOT EXISTS chesscom_import_job_games (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    PRIMARY KEY (user_id, job_id, game_id),
    FOREIGN KEY (user_id, job_id)
      REFERENCES chesscom_import_jobs(user_id, id) ON DELETE CASCADE,
    FOREIGN KEY (user_id, game_id)
      REFERENCES chesscom_games(user_id, id) ON DELETE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS chesscom_import_job_games_user_job_idx ON chesscom_import_job_games(user_id, job_id)',
  `CREATE TABLE IF NOT EXISTS chesscom_analysis_positions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    ply INTEGER NOT NULL,
    fen TEXT NOT NULL,
    played_move TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    best_move TEXT,
    best_score TEXT,
    played_score TEXT,
    loss_centipawns INTEGER,
    error TEXT,
    processed_at INTEGER,
    FOREIGN KEY (user_id, game_id)
      REFERENCES chesscom_games(user_id, id) ON DELETE CASCADE
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS chesscom_analysis_game_ply_unique ON chesscom_analysis_positions(game_id, ply)',
  'CREATE INDEX IF NOT EXISTS chesscom_analysis_user_status_idx ON chesscom_analysis_positions(user_id, status)',
  `CREATE TABLE IF NOT EXISTS chesscom_puzzles (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    source_game_url TEXT NOT NULL,
    ply INTEGER NOT NULL,
    fen TEXT NOT NULL,
    solution_line TEXT NOT NULL,
    estimated_rating INTEGER NOT NULL,
    stockfish_version TEXT NOT NULL,
    analysis_settings TEXT NOT NULL,
    score_loss TEXT NOT NULL,
    rating_formula_version TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id, game_id)
      REFERENCES chesscom_games(user_id, id) ON DELETE CASCADE
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS chesscom_puzzles_user_id_unique ON chesscom_puzzles(user_id, id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS chesscom_puzzles_user_source_ply_unique ON chesscom_puzzles(user_id, source_game_url, ply)',
  'CREATE INDEX IF NOT EXISTS chesscom_puzzles_user_rating_idx ON chesscom_puzzles(user_id, estimated_rating)',
  `CREATE TABLE IF NOT EXISTS chesscom_puzzle_progress (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    puzzle_id TEXT NOT NULL,
    solve_order INTEGER NOT NULL,
    solved INTEGER NOT NULL DEFAULT 0,
    last_result INTEGER,
    review_due_at INTEGER,
    review_state TEXT NOT NULL DEFAULT 'new',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, puzzle_id),
    FOREIGN KEY (user_id, puzzle_id)
      REFERENCES chesscom_puzzles(user_id, id) ON DELETE CASCADE
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS chesscom_puzzle_progress_order_unique ON chesscom_puzzle_progress(user_id, solve_order)',
  'CREATE INDEX IF NOT EXISTS chesscom_puzzle_progress_review_idx ON chesscom_puzzle_progress(user_id, review_due_at)',
  `CREATE TABLE IF NOT EXISTS chesscom_ratings (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating REAL NOT NULL,
    rating_deviation REAL NOT NULL,
    volatility REAL NOT NULL,
    number_of_results INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chesscom_rating_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating REAL NOT NULL,
    rating_deviation REAL NOT NULL,
    volatility REAL NOT NULL,
    number_of_results INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS chesscom_rating_history_user_time_idx ON chesscom_rating_history(user_id, created_at)',
];

declare global {
  // Reuse connections across Next.js hot reloads in development.
  var __lycheeLibsqlClient: ReturnType<typeof createClient> | undefined;
  var __lycheeSchemaPromise: Promise<void> | undefined;
}

export async function dbConnect(): Promise<void> {
  if (!globalThis.__lycheeSchemaPromise) {
    globalThis.__lycheeSchemaPromise = (async () => {
      await client.execute('PRAGMA foreign_keys = ON');
      for (const statement of schemaStatements) {
        await client.execute(statement);
      }
      const historyColumns = await client.execute(
        'PRAGMA table_info(rating_history)'
      );
      if (!historyColumns.rows.some((column) => column.name === 'source_id')) {
        await client.execute(
          'ALTER TABLE rating_history ADD COLUMN source_id TEXT'
        );
      }
      await client.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS rating_history_source_id_unique ON rating_history(source_id)'
      );
      const chesscomGameColumns = await client.execute(
        'PRAGMA table_info(chesscom_games)'
      );
      if (
        chesscomGameColumns.rows.some(
          (column) => column.name === 'import_job_id'
        )
      ) {
        await client.execute(
          `INSERT OR IGNORE INTO chesscom_import_job_games (user_id, job_id, game_id)
           SELECT games.user_id, games.import_job_id, games.id
           FROM chesscom_games AS games
           INNER JOIN chesscom_import_jobs AS jobs
             ON jobs.user_id = games.user_id
            AND jobs.id = games.import_job_id
           WHERE games.import_job_id IS NOT NULL`
        );
      }
      const userColumns = await client.execute('PRAGMA table_info(users)');
      if (
        !userColumns.rows.some((column) => column.name === 'chesscom_username')
      ) {
        await client.execute(
          'ALTER TABLE users ADD COLUMN chesscom_username TEXT'
        );
      }
      const importJobColumns = await client.execute(
        'PRAGMA table_info(chesscom_import_jobs)'
      );
      if (
        !importJobColumns.rows.some(
          (column) => column.name === 'analysis_status'
        )
      ) {
        await client.execute(
          "ALTER TABLE chesscom_import_jobs ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'idle'"
        );
      }
    })().catch((error) => {
      globalThis.__lycheeSchemaPromise = undefined;
      throw error;
    });
  }
  await globalThis.__lycheeSchemaPromise;
}

export { client };
