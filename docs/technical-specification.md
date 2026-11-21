# Lychee technical specification

## Purpose

Lychee is a web app for personalized chess puzzles. The README describes the goal as improving chess skills through personalized puzzles. The signed-in dashboard and trainer use Lichess identity/rating data and a relational puzzle corpus.

## Stack and runtime

- Next.js 14.1.0 App Router with React 18 and TypeScript 5.
- SQLite/libSQL accessed through Drizzle ORM and the libSQL client. Local development uses a SQLite file; Vercel production must use a persistent remote Turso/libSQL database.
- Lichess OAuth is handled by Arctic. The app stores its own random session tokens as SHA-256 hashes in the SQL database.
- `chess.js`, `react-chessboard`, and local puzzle UI components provide chess interaction.
- Tailwind CSS 3 and Radix UI components support the interface.
- TypeScript is strict, emits no files, and maps `@/*` to the repository root.

## Application structure

- `app/`: App Router pages, route handlers, and global styles. Main pages include the dashboard (`app/page.tsx`), trainer (`app/trainer/page.tsx`), themed puzzle groups, and Woodpecker mode.
- `app/api/`: authenticated puzzle, dashboard, user, and sign-out handlers. Several endpoint-specific helpers live alongside their `route.ts` files.
- `components/`: shared UI, authentication controls, puzzle board/controls, and Woodpecker UI.
- `lib/`: database connection/schema initialization (`db.ts`), Drizzle table definitions (`schema.ts`), typed SQL repository functions (`store.ts`), auth, and shared utilities.
- `src/`: rating calculations, puzzle similarity, spaced repetition, and Leitner review logic.
- `scripts/`: database initialization plus Lichess CSV and one-time MongoDB imports.
- `test/`: Jest unit tests for SM-2, similarity, and Glicko rating calculations.

## Main flows

### Authentication and initialization

1. `/login/lichess` creates OAuth state and a PKCE verifier, stores them in cookies, and redirects to Lichess.
2. `/login/lichess/callback` validates the returned state/code, fetches the Lichess account, creates or finds the local user, then stores a hash of a random session token and sets the `auth_session` cookie.
3. On first login, the callback imports the user's Lichess puzzle rating and initializes rating records. An empty solved-puzzle query represents a new user.
4. `validateRequest()` initializes the SQL schema as needed, hashes the cookie token, checks its database expiry, and refreshes sessions with less than 15 days remaining. The home page renders the dashboard only for an authenticated user.

### Puzzle selection and submission

1. The trainer and the `/api/puzzle/nextPuzzle` handler call the shared selector in `app/api/puzzle/nextPuzzle/nextFor.ts`.
2. The selector queries `puzzles` by rating and uses the indexed `puzzle_themes` relation for exact, case-insensitive theme matches. It excludes solved IDs through a relational anti-join and can use SM-2 theme weighting or a Leitner review; selected active puzzles are persisted for authenticated non-Woodpecker play.
3. `/api/puzzle/submit` consumes the active puzzle, updates the overall and theme Glicko ratings, records the solved puzzle and rating history, and updates Leitner/time-based review state.
4. Similar-puzzle selection and caching are implemented in `src/similarity.ts`, `src/similarityCache.ts`, and the `similarBatch` API helpers.

## Persistence

Drizzle table definitions are in `lib/schema.ts`; typed read/write operations are in `lib/store.ts`. The schema normalizes data that was formerly stored in MongoDB collections:

- Users and hashed auth sessions.
- `ActivePuzzle`: one active puzzle per username, with optional original puzzle for a similar-puzzle review and a mode/group ID.
- `SolvedPuzzles`: one row per `(username, puzzle_id)`, with a position to retain review order.
- `Rating` and `UserThemeRating`: overall and per-theme Glicko fields.
- `RatingHistory`: timestamped overall/per-theme rating entries.
- `LeitnerReviews`, `ThemeTimes`, `RecentGroups`, and `LastBatches`: review and trainer state.
- `Similarity`: cached puzzle similarity results.
- `Puzzles` and `PuzzleThemes`: puzzle data plus one indexed row per puzzle/theme.

`dbConnect()` creates the tables and indexes idempotently on first use. `npm run db:init` initializes them explicitly. A fresh database needs a puzzle corpus:

- `npm run db:import-lichess -- ./lichess_db_puzzle.csv --limit 25000` imports a starter subset from the official, decompressed Lichess CSV. Use `--all` for the full file. Since the official CSV has no Lychee `hierarchy_tags`, it uses the theme list as a flat similarity signature.
- `npm run db:import-mongo` streams the previous MongoDB collections, including `testPuzzles`, into an empty target database in batches. It maps old Lucia session IDs to hashed session tokens so unexpired `auth_session` cookies can remain valid. It requires source URI/database settings. An interrupted migration can be resumed with `npm run db:import-mongo -- --resume` before serving app traffic.

## Configuration

- `TURSO_DATABASE_URL`: optional locally (defaults to `file:./lychee.db`); required in production for a persistent remote database.
- `TURSO_AUTH_TOKEN`: remote Turso credential; not required for local SQLite.
- `SOURCE_MONGODB_URI` and `SOURCE_MONGODB_DATABASE`: required only for the one-time importer.
- `LICHESS_PUZZLES_CSV`: optional path to a decompressed Lichess CSV; alternatively pass the path to `db:import-lichess`.
- `LICHESS_CLIENT_ID`: required to construct the Lichess OAuth client (`lib/auth.ts`).
- `NEXT_PUBLIC_BASE_URL`: used as the OAuth callback base URL in production (`config/base-url.ts`).
- `REDIRECT`: optional root-layout redirect target; if set, the layout redirects instead of rendering pages (`app/layout.tsx`).
- `.env.local` is ignored by Git. The previously committed MongoDB credential has been removed from `.env.template`, but must still be rotated because it may remain in Git history.

## Development and verification

```sh
npm install
npm run db:init
npm run dev
npm run db:import-lichess -- ./lichess_db_puzzle.csv --limit 25000
npm test
npm test -- test/sm2.test.ts
npm run format
npm run lint
npx tsc --noEmit
npm run build
```

`npm run db:import-mongo` is a one-time migration command and requires `SOURCE_MONGODB_URI` and `SOURCE_MONGODB_DATABASE` in `.env.local`. `npm run format:fix` applies Prettier formatting. The Jest configuration uses `ts-jest`, discovers tests under `test/`, and maps `@/*` imports to the repository root. The GitHub Actions workflow currently runs formatting and Jest, but not lint, typecheck, or build.

## Evidence

- `README.md`
- `package.json`, `package-lock.json`, `tsconfig.json`, `jest.config.js`
- `.github/workflows/main.yml`, `.env.template`, `.gitignore`
- `app/page.tsx`, `app/trainer/page.tsx`, `app/login/lichess/route.ts`, `app/login/lichess/callback/route.ts`
- `app/api/puzzle/nextPuzzle/nextFor.ts`, `app/api/puzzle/submit/route.ts`
- `lib/auth.ts`, `lib/auth-types.ts`, `lib/db.ts`, `lib/schema.ts`, `lib/store.ts`, `config/base-url.ts`
- `scripts/init-db.ts`, `scripts/import-mongo.ts`, `scripts/import-lichess-csv.ts`, `src/`, `test/`
