import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
});

export const sessions = sqliteTable(
  'auth_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('auth_sessions_user_id_idx').on(table.userId)]
);

export const ratings = sqliteTable('ratings', {
  username: text('username').primaryKey(),
  rating: real('rating').notNull(),
  ratingDeviation: real('rating_deviation').notNull(),
  volatility: real('volatility').notNull(),
  numberOfResults: integer('number_of_results').notNull(),
});

export const initialRatings = sqliteTable('initial_ratings', {
  username: text('username').primaryKey(),
  rating: real('rating').notNull(),
});

export const solvedPuzzles = sqliteTable(
  'solved_puzzles',
  {
    username: text('username').notNull(),
    puzzleId: text('puzzle_id').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.username, table.puzzleId] }),
    index('solved_puzzles_order_idx').on(table.username, table.position),
  ]
);

export const ratingHistory = sqliteTable(
  'rating_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceId: text('source_id').unique('rating_history_source_id_unique'),
    username: text('username').notNull(),
    theme: text('theme').notNull(),
    rating: real('rating').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('rating_history_user_theme_time_idx').on(
      table.username,
      table.theme,
      table.createdAt
    ),
  ]
);

export const userThemeRatings = sqliteTable(
  'user_theme_ratings',
  {
    username: text('username').notNull(),
    theme: text('theme').notNull(),
    rating: real('rating').notNull(),
    ratingDeviation: real('rating_deviation').notNull(),
    volatility: real('volatility').notNull(),
    numberOfResults: integer('number_of_results').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.username, table.theme] }),
    index('user_theme_ratings_username_idx').on(table.username),
  ]
);

export const themeTimes = sqliteTable(
  'theme_times',
  {
    username: text('username').notNull(),
    theme: text('theme').notNull(),
    time: real('time').notNull(),
  },
  (table) => [primaryKey({ columns: [table.username, table.theme] })]
);

export const activePuzzles = sqliteTable('active_puzzles', {
  username: text('username').primaryKey(),
  puzzle: text('puzzle').notNull(),
  reviewee: text('reviewee'),
  groupId: text('group_id').notNull(),
});

export const leitnerReviews = sqliteTable(
  'leitner_reviews',
  {
    username: text('username').notNull(),
    groupId: text('group_id').notNull(),
    boxA: text('box_a').notNull(),
    boxB: text('box_b').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.username, table.groupId] }),
    index('leitner_reviews_username_idx').on(table.username),
  ]
);

export const recentGroups = sqliteTable(
  'recent_groups',
  {
    username: text('username').notNull(),
    groupId: text('group_id').notNull(),
    lastUsed: integer('last_used').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.username, table.groupId] }),
    index('recent_groups_last_used_idx').on(table.username, table.lastUsed),
  ]
);

export const lastBatches = sqliteTable('last_batches', {
  username: text('username').primaryKey(),
  batch: text('batch').notNull(),
});

export const similarityCaches = sqliteTable('similarity_caches', {
  puzzleId: text('puzzle_id').primaryKey(),
  cache: text('cache').notNull(),
});

export const puzzles = sqliteTable(
  'puzzles',
  {
    puzzleId: text('puzzle_id').primaryKey(),
    fen: text('fen').notNull(),
    moves: text('moves').notNull(),
    rating: integer('rating').notNull(),
    ratingDeviation: integer('rating_deviation').notNull(),
    popularity: integer('popularity').notNull(),
    numberOfPlays: integer('number_of_plays').notNull(),
    themes: text('themes').notNull(),
    gameUrl: text('game_url').notNull(),
    hierarchyTags: text('hierarchy_tags').notNull(),
    data: text('data').notNull(),
  },
  (table) => [index('puzzles_rating_idx').on(table.rating)]
);

export const puzzleThemes = sqliteTable(
  'puzzle_themes',
  {
    puzzleId: text('puzzle_id')
      .notNull()
      .references(() => puzzles.puzzleId, { onDelete: 'cascade' }),
    theme: text('theme').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.puzzleId, table.theme] }),
    index('puzzle_themes_theme_idx').on(table.theme, table.puzzleId),
  ]
);

export const schema = {
  users,
  sessions,
  ratings,
  initialRatings,
  solvedPuzzles,
  ratingHistory,
  userThemeRatings,
  themeTimes,
  activePuzzles,
  leitnerReviews,
  recentGroups,
  lastBatches,
  similarityCaches,
  puzzles,
  puzzleThemes,
};
