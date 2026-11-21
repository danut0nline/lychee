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
    username TEXT NOT NULL UNIQUE
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
    })().catch((error) => {
      globalThis.__lycheeSchemaPromise = undefined;
      throw error;
    });
  }
  await globalThis.__lycheeSchemaPromise;
}

export { client };
