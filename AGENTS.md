# Agent guidance

- Read [docs/technical-specification.md](docs/technical-specification.md) before changing application flow, persistence, or puzzle selection.
- This is a single Next.js 14 app, not a workspace. App Router pages and handlers live in `app/`; shared UI is in `components/`; the relational schema and data access live in `lib/schema.ts` and `lib/store.ts`; rating, similarity, and review algorithms are in `src/`.
- Install with `npm install`; run locally with `npm run dev` (port 3000). Local development defaults to `file:./lychee.db`; initialize it with `npm run db:init`. Set `LICHESS_CLIENT_ID` for sign-in. Production must use persistent Turso/libSQL settings (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) and set `NEXT_PUBLIC_BASE_URL` for OAuth callbacks.
- Puzzle training requires an imported corpus in the `puzzles` table. Migrate MongoDB user data and `testPuzzles` with `SOURCE_MONGODB_URI`, `SOURCE_MONGODB_DATABASE`, and `npm run db:import-mongo`; the target database must be empty. Resume an interrupted import with `npm run db:import-mongo -- --resume` before serving app traffic.
- The old MongoDB connection string was removed from `.env.template`; rotate it because removing it from the working tree does not remove it from Git history. `.env.local` and local SQLite database files are git-ignored.
- The root layout redirects every request when `REDIRECT` is set. Leave it unset for ordinary local development.
- Run all unit tests with `npm test`; run one test file with `npm test -- test/sm2.test.ts` (replace the path as needed). Tests are under `test/` and use Jest/ts-jest.
- Run formatting validation with `npm run format`; `npm run format:fix` rewrites files. Other checks are `npm run lint`, `npx tsc --noEmit`, and `npm run build`. CI currently runs only formatting and Jest.
- Do not use a local `file:` database in Vercel production: serverless filesystem storage is ephemeral. Set the Turso URL and token in deployment environment variables.
- Keep Drizzle definitions in `lib/schema.ts` and bootstrap DDL in `lib/db.ts` aligned; when changing an existing table, include an upgrade step because `CREATE TABLE IF NOT EXISTS` does not alter deployed schemas.
- Preserve the `@/*` TypeScript alias (root-relative) and Prettier's single-quote settings when adding imports or formatting code.
