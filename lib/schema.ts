import {
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  chesscomUsername: text('chesscom_username'),
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

export const chesscomImportJobs = sqliteTable(
  'chesscom_import_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceUsername: text('source_username').notNull(),
    status: text('status').notNull(),
    analysisStatus: text('analysis_status').notNull().default('idle'),
    windowStart: integer('window_start').notNull(),
    windowEnd: integer('window_end').notNull(),
    totalGames: integer('total_games').notNull().default(0),
    importedGames: integer('imported_games').notNull().default(0),
    totalPositions: integer('total_positions').notNull().default(0),
    processedPositions: integer('processed_positions').notNull().default(0),
    candidateCount: integer('candidate_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    checkpoint: text('checkpoint'),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('chesscom_import_jobs_user_id_unique').on(
      table.userId,
      table.id
    ),
    index('chesscom_import_jobs_user_created_idx').on(
      table.userId,
      table.createdAt
    ),
  ]
);

export const chesscomGames = sqliteTable(
  'chesscom_games',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceUsername: text('source_username').notNull(),
    sourceUrl: text('source_url').notNull(),
    playedAt: integer('played_at').notNull(),
    whiteUsername: text('white_username').notNull(),
    blackUsername: text('black_username').notNull(),
    whiteRating: integer('white_rating'),
    blackRating: integer('black_rating'),
    timeClass: text('time_class'),
    rules: text('rules').notNull(),
    result: text('result').notNull(),
    pgn: text('pgn').notNull(),
    analysisStatus: text('analysis_status').notNull().default('pending'),
    skipReason: text('skip_reason'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('chesscom_games_user_id_unique').on(table.userId, table.id),
    uniqueIndex('chesscom_games_user_source_url_unique').on(
      table.userId,
      table.sourceUrl
    ),
    index('chesscom_games_user_played_at_idx').on(table.userId, table.playedAt),
  ]
);

export const chesscomImportJobGames = sqliteTable(
  'chesscom_import_job_games',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: text('job_id').notNull(),
    gameId: text('game_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.jobId, table.gameId] }),
    foreignKey({
      columns: [table.userId, table.jobId],
      foreignColumns: [chesscomImportJobs.userId, chesscomImportJobs.id],
      name: 'chesscom_import_job_games_user_job_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.userId, table.gameId],
      foreignColumns: [chesscomGames.userId, chesscomGames.id],
      name: 'chesscom_import_job_games_user_game_fk',
    }).onDelete('cascade'),
    index('chesscom_import_job_games_user_job_idx').on(
      table.userId,
      table.jobId
    ),
  ]
);

export const chesscomAnalysisPositions = sqliteTable(
  'chesscom_analysis_positions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gameId: text('game_id').notNull(),
    ply: integer('ply').notNull(),
    fen: text('fen').notNull(),
    playedMove: text('played_move').notNull(),
    status: text('status').notNull().default('pending'),
    bestMove: text('best_move'),
    bestScore: text('best_score'),
    playedScore: text('played_score'),
    lossCentipawns: integer('loss_centipawns'),
    error: text('error'),
    processedAt: integer('processed_at'),
  },
  (table) => [
    foreignKey({
      columns: [table.userId, table.gameId],
      foreignColumns: [chesscomGames.userId, chesscomGames.id],
      name: 'chesscom_analysis_user_game_fk',
    }).onDelete('cascade'),
    uniqueIndex('chesscom_analysis_game_ply_unique').on(
      table.gameId,
      table.ply
    ),
    index('chesscom_analysis_user_status_idx').on(table.userId, table.status),
  ]
);

export const chesscomPuzzles = sqliteTable(
  'chesscom_puzzles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gameId: text('game_id').notNull(),
    sourceGameUrl: text('source_game_url').notNull(),
    ply: integer('ply').notNull(),
    fen: text('fen').notNull(),
    solutionLine: text('solution_line').notNull(),
    estimatedRating: integer('estimated_rating').notNull(),
    stockfishVersion: text('stockfish_version').notNull(),
    analysisSettings: text('analysis_settings').notNull(),
    scoreLoss: text('score_loss').notNull(),
    ratingFormulaVersion: text('rating_formula_version').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('chesscom_puzzles_user_id_unique').on(table.userId, table.id),
    foreignKey({
      columns: [table.userId, table.gameId],
      foreignColumns: [chesscomGames.userId, chesscomGames.id],
      name: 'chesscom_puzzles_user_game_fk',
    }).onDelete('cascade'),
    uniqueIndex('chesscom_puzzles_user_source_ply_unique').on(
      table.userId,
      table.sourceGameUrl,
      table.ply
    ),
    index('chesscom_puzzles_user_rating_idx').on(
      table.userId,
      table.estimatedRating
    ),
  ]
);

export const chesscomPuzzleProgress = sqliteTable(
  'chesscom_puzzle_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    puzzleId: text('puzzle_id').notNull(),
    solveOrder: integer('solve_order').notNull(),
    solved: integer('solved').notNull().default(0),
    lastResult: integer('last_result'),
    reviewDueAt: integer('review_due_at'),
    reviewState: text('review_state').notNull().default('new'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.puzzleId] }),
    foreignKey({
      columns: [table.userId, table.puzzleId],
      foreignColumns: [chesscomPuzzles.userId, chesscomPuzzles.id],
      name: 'chesscom_progress_user_puzzle_fk',
    }).onDelete('cascade'),
    uniqueIndex('chesscom_puzzle_progress_order_unique').on(
      table.userId,
      table.solveOrder
    ),
    index('chesscom_puzzle_progress_review_idx').on(
      table.userId,
      table.reviewDueAt
    ),
  ]
);

export const chesscomRatings = sqliteTable('chesscom_ratings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  rating: real('rating').notNull(),
  ratingDeviation: real('rating_deviation').notNull(),
  volatility: real('volatility').notNull(),
  numberOfResults: integer('number_of_results').notNull(),
});

export const chesscomRatingHistory = sqliteTable(
  'chesscom_rating_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: real('rating').notNull(),
    ratingDeviation: real('rating_deviation').notNull(),
    volatility: real('volatility').notNull(),
    numberOfResults: integer('number_of_results').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('chesscom_rating_history_user_time_idx').on(
      table.userId,
      table.createdAt
    ),
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
  chesscomImportJobs,
  chesscomGames,
  chesscomImportJobGames,
  chesscomAnalysisPositions,
  chesscomPuzzles,
  chesscomPuzzleProgress,
  chesscomRatings,
  chesscomRatingHistory,
};
