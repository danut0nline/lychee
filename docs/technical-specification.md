# Lychee technical specification

## Purpose

Lychee is a web app for personalized chess puzzles. The README describes the goal as improving chess skills through personalized puzzles. The signed-in dashboard and trainer are backed by Lichess identity/rating data and a MongoDB puzzle corpus.

## Stack and runtime

- Next.js 14.1.0 App Router with React 18 and TypeScript 5.
- MongoDB accessed through Mongoose 8; Lucia 3 manages sessions, with its MongoDB adapter.
- Arctic handles Lichess OAuth. `chess.js`, `react-chessboard`, and local puzzle UI components provide chess interaction.
- Tailwind CSS 3 and Radix UI components support the interface.
- TypeScript is strict, emits no files, and maps `@/*` to the repository root.

## Application structure

- `app/`: App Router pages, route handlers, and global styles. Main pages include the dashboard (`app/page.tsx`), trainer (`app/trainer/page.tsx`), themed puzzle groups, and Woodpecker mode.
- `app/api/`: authenticated puzzle, dashboard, user, and sign-out handlers. Several endpoint-specific helpers live alongside their `route.ts` files.
- `components/`: shared UI, authentication controls, puzzle board/controls, and Woodpecker UI.
- `lib/`: MongoDB connection (`db.ts`), Lucia/Lichess auth (`auth.ts`), and shared utilities.
- `models/`: Mongoose schemas for users, sessions, active puzzles, puzzle history, ratings, and review state.
- `src/`: rating calculations, puzzle similarity, spaced repetition, and Leitner review logic.
- `test/`: Jest unit tests for SM-2, similarity, and Glicko rating calculations.

## Main flows

### Authentication and initialization

1. `/login/lichess` creates OAuth state and a PKCE verifier, stores them in cookies, and redirects to Lichess.
2. `/login/lichess/callback` validates the returned state/code, fetches the Lichess account, creates or finds the local user, then creates a Lucia session.
3. On first login, the callback imports the user's Lichess puzzle rating and initializes rating and solved-puzzle records.
4. `validateRequest()` connects to MongoDB and validates the Lucia session cookie. The home page renders the dashboard only for an authenticated user.

### Puzzle selection and submission

1. The trainer and the `/api/puzzle/nextPuzzle` handler call the shared selector in `app/api/puzzle/nextPuzzle/nextFor.ts`.
2. The selector reads eligible puzzles from MongoDB collection `testPuzzles`, avoiding IDs recorded as solved. It selects around the user's or theme's rating and can use SM-2 theme weighting or a Leitner review; selected active puzzles are persisted for authenticated non-Woodpecker play.
3. `/api/puzzle/submit` consumes the active puzzle, updates the overall and theme Glicko ratings, records the solved puzzle and rating history, and updates Leitner/time-based review state.
4. Similar-puzzle selection and caching are implemented in `src/similarity.ts`, `src/similarityCache.ts`, and the `similarBatch` API helpers.

## Persistence

Mongoose model definitions are in `models/`. The primary records include:

- Users and Lucia sessions.
- `ActivePuzzle`: one active puzzle per username, with optional original puzzle for a similar-puzzle review and a mode/group ID.
- `AllRound`: solved puzzle IDs by username.
- `Rating` and `UserThemeRating`: overall and per-theme Glicko fields.
- `RatingHistory`: timestamped overall/per-theme rating entries.
- `ThemedLeitner`, `TimeTheme`, `RecentGroup`, and `LastBatch`: review and trainer state.
- `Similarity`: cached puzzle similarity results.

The puzzle selector expects the corpus collection named `testPuzzles`. No corpus import/seed script or database migration workflow is present in the repository.

## Configuration

- `MONGODB_URI`: required MongoDB connection string (`lib/db.ts`).
- `LICHESS_CLIENT_ID`: required to construct the Lichess OAuth client (`lib/auth.ts`).
- `NEXT_PUBLIC_BASE_URL`: used as the OAuth callback base URL in production (`config/base-url.ts`).
- `REDIRECT`: optional root-layout redirect target; if set, the layout redirects instead of rendering pages (`app/layout.tsx`).
- `.env.local` is ignored by Git. **The tracked `.env.template` currently contains a MongoDB credential; do not copy or reuse it. Rotate that credential and replace the template value with a placeholder.**

## Development and verification

```sh
npm install
npm run dev
npm test
npm test -- test/sm2.test.ts
npm run format
npm run lint
npx tsc --noEmit
npm run build
```

`npm run format:fix` applies Prettier formatting. The Jest configuration uses `ts-jest`, discovers tests under `test/`, and maps `@/*` imports to the repository root. The GitHub Actions workflow currently runs formatting and Jest, but not lint, typecheck, or build.

## Evidence

- `README.md`
- `package.json`, `package-lock.json`, `tsconfig.json`, `jest.config.js`
- `.github/workflows/main.yml`, `.env.template`, `.gitignore`
- `app/page.tsx`, `app/trainer/page.tsx`, `app/login/lichess/route.ts`, `app/login/lichess/callback/route.ts`
- `app/api/puzzle/nextPuzzle/nextFor.ts`, `app/api/puzzle/submit/route.ts`
- `lib/auth.ts`, `lib/db.ts`, `config/base-url.ts`
- `models/`, `src/`, `test/`
