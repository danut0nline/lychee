# Lychee agent notes

## Request clarification and permissions

- For each new request, use the `grill-me` skill to clarify scope before acting. Ask one question at a time and do not begin implementation until the user confirms a shared understanding.
- Treat the repository root as the filesystem and command-access boundary. Ask for explicit permission before reading, writing, or running commands against paths outside it. A permission grant must be scoped; offer the user a per-action or session-scoped option when appropriate.
- Ask before creating any Git worktree. Offer approval for that worktree alone or scoped approval for worktree creation during the current session. If its location is outside the repository root, obtain permission for that outside path as well.

## Before committing

- Do not commit or merge without the user's explicit approval. Before committing, show a concise summary of the changes and the proposed commit message, then ask for a clear yes/no. Use a concise Conventional Commit message, such as `docs: clarify pre-commit workflow`.
- Before merging into `main`, wait until implementation and verification are complete, show a summary of what will be merged, and ask for separate explicit yes/no approval.
- Complete the following verification workflow before asking to commit:
  1. Run `npm run format`. If it fails, run `npm run format:fix`, then rerun `npm run format` and confirm it passes before continuing.
  2. Run `npm run lint` and `npm run test`.
  3. Run `npx tsc --noEmit`.
  4. Run `npm run build`. Its `prebuild` lifecycle hook runs automatically; do not run `npm run prebuild` separately.
  5. Run `npm run start`, perform a brief local smoke check, and stop the server.
- Fix failures before proceeding. After any code changes made to resolve verification or review findings, rerun the full verification workflow.
- Run the `code-review` skill before committing, covering both committed branch changes against the agreed comparison point and the pending working-tree diff. Supply the comparison point and spec when available; ask the user for missing required inputs rather than silently skipping review.
- Fix actionable, in-scope review findings and rerun the full verification workflow. Ask the user before expanding scope or when a finding cannot be safely resolved.

## Project shape

- Next.js 14 App Router / React 18 app; `app/` contains pages and API route handlers, `components/` shared UI, `lib/` database/auth/repositories, and `src/` rating, similarity, and review algorithms.
- For end-to-end flow details, see [docs/technical-specification.md](docs/technical-specification.md). Database operations are in `lib/store.ts`; Drizzle definitions are in `lib/schema.ts`, while bootstrap DDL and compatibility upgrades are in `lib/db.ts`. Keep both schema sources aligned and add an explicit upgrade for existing tables: `CREATE TABLE IF NOT EXISTS` does not alter deployed schemas.

## Local setup and data

- Install with `npm install`; copy `.env.template` to `.env.local`. Local DB defaults to `file:./lychee.db`; set `LICHESS_CLIENT_ID` for Lichess sign-in.
- Run `npm run db:init` to initialize the local schema. A fresh database has no puzzle corpus: import a decompressed Lichess CSV with `npm run db:import-lichess -- ./lichess_db_puzzle.csv --limit 25000` (`--all` imports the whole file). The importer refuses a non-empty corpus unless resuming an interrupted import with `--resume`.
- Production/Vercel needs a persistent remote Turso/libSQL `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; local SQLite files are not persistent there. Set `NEXT_PUBLIC_BASE_URL` to the deployed origin for the Lichess OAuth callback.
- Leave `REDIRECT` unset for normal development; when set, the root layout redirects every request.
- `npm run dev` and `npm run build` automatically run `scripts/copy-stockfish-assets.cjs` first to copy the Stockfish JS/WASM bundle into ignored `public/stockfish/`. Keep this pre-step intact when changing those scripts.
- Keep credentials in `.env.local`, not tracked templates. The technical specification notes a legacy MongoDB credential may remain in Git history; verify rotation rather than assuming removal from the working tree was sufficient.

## Verification

- `npm test` runs Jest serially. Run one test file with `npm test -- test/sm2.test.ts`; tests live in `test/` and Jest maps `@/*` to the repository root.
- Run formatting check with `npm run format` (apply with `npm run format:fix`), lint with `npm run lint`, typecheck with `npx tsc --noEmit`, and production build with `npm run build`.
- CI currently checks Prettier and Jest; run lint, typecheck, and build explicitly when relevant because CI does not.

## Data import

- The MongoDB importer is a one-time migration path, not normal app setup. It requires `SOURCE_MONGODB_URI` and `SOURCE_MONGODB_DATABASE`, targets an empty database, and supports `npm run db:import-mongo -- --resume` after interruption before serving app traffic.
