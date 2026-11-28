# Technical Implementation Breakdown: Chess.com Game Puzzles

**Status:** Draft  
**Source specification:** [`todo.md`](./todo.md)  
**Implementation order:** Stories are ordered by dependency. Complete the feasibility spike before committing to the browser-engine integration.

## Architecture constraints

- Keep this feature separate from the shared Lichess puzzle corpus and shared overall rating.
- Scope imported games, jobs, generated puzzles, solve history, and category rating to the authenticated Lychee user ID.
- Use the Chess.com public Published-Data API only. Do not request Chess.com credentials or accept arbitrary API URLs from the browser.
- Run Stockfish in a browser Web Worker for the first release. Analysis pauses when the browser closes and resumes from persisted progress when the user returns.
- Do not add server-side Stockfish or an engine-location setting in the first release.
- Keep Drizzle declarations in `lib/schema.ts` and bootstrap/upgrade DDL in `lib/db.ts` aligned.

## Story 0: Prove the browser-analysis approach

**As a developer,** I need to verify that Stockfish can run and resume reliably in this Next.js application before building the import workflow around it.

### Tasks

1. Identify a maintained Stockfish JavaScript/WebAssembly distribution that can run in a Web Worker in the current Next.js 14 build.
2. Verify worker and WASM asset loading in development and production builds.
3. Define a UCI analysis contract: position input, best-move output, score perspective, mate-score handling, stop/restart behavior, and deterministic engine settings.
4. Prototype comparing the best move with the configured player's played move and calculate centipawn loss consistently.
5. Measure analysis time on representative game positions and confirm the 100-game, all-moves workflow is viable across multiple browser visits.
6. Record the Stockfish version and proposed initial engine-feature-to-puzzle-rating formula.

### Acceptance criteria

- A Web Worker can load Stockfish, analyze a FEN, return a legal best move and score, and terminate cleanly.
- Analysis does not block the page.
- The same fixture produces stable, correctly oriented score-loss calculations with the chosen engine settings.
- The production build can locate and load all worker/WASM assets.

## Story 1: Persist the Chess.com setting and feature data safely

**As a signed-in Lychee user,** I want to save a Chess.com username so later imports use that configured public account.

### Tasks

1. Add the Chess.com username to the authenticated user's settings. Prefer a nullable field on the existing user record unless repository conventions establish a settings table.
2. Add Drizzle schema definitions and matching bootstrap/upgrade DDL in `lib/schema.ts` and `lib/db.ts`.
3. Design user-owned records for:
   - Import jobs and their status, counters, date window, and resumable checkpoint.
   - Imported games and source metadata/PGN.
   - Generated puzzles and engine/rating metadata.
   - Puzzle solve/review progress.
   - The separate **user games puzzles** Glicko-2 rating.
4. Use foreign keys to the local user ID and unique constraints for idempotency, including source game URL and ply for generated puzzles.
5. Add repository functions in `lib/store.ts` for the new entities. Do not trust a user ID supplied by a client.
6. Define explicit deletion semantics for the imported games, analysis, puzzles, solve/review state, and category rating/history.

### Acceptance criteria

- Existing databases upgrade without losing current data.
- Every feature record is associated with its authenticated Lychee user.
- A database query scoped to one user cannot return another user's imported content.
- Repeated inserts for the same source game and ply are idempotent.

## Story 2: Configure and validate the Chess.com username

**As a signed-in Lychee user,** I want to configure and verify the public Chess.com username used for imports.

### Tasks

1. Add a Settings UI field for the Chess.com username, save action, validation feedback, and configured-account display.
2. Add authenticated read/update API handlers using the existing request validation pattern in `lib/auth.ts`.
3. Normalize and validate the username before constructing fixed Chess.com API URLs.
4. Fetch the public profile to confirm the account exists; clearly state that Lychee does not verify ownership.
5. Ensure changing the configured username affects future imports only. Preserve the original source username on existing imports.

### Acceptance criteria

- The setting persists across sessions and is visible only to the signed-in user.
- Invalid or unavailable usernames produce actionable feedback.
- No Chess.com password or token is requested or stored.
- A changed username does not silently relabel or delete previous imports.

## Story 3: Import and persist the recent game set

**As a signed-in Lychee user,** I want to import recent eligible games from my configured Chess.com account.

### Tasks

1. Add an authenticated endpoint to start an import job using the saved username; do not accept an arbitrary username or archive URL as job authority.
2. Discover available monthly archives through the public API and fetch archives serially with a recognizable User-Agent.
3. Fetch only months overlapping the 30-day window, then filter individual games to the exact cutoff.
4. Keep completed standard-chess games, exclude variants and unfinished games, sort newest first, and select at most 100 eligible games.
5. Persist game metadata and PGN with source URL, end time, player names/ratings, time class, and rules.
6. Make retries safe and handle missing accounts, empty archives, HTTP 429, transient failures, and partial completion without discarding successful imports.
7. Provide an authenticated status endpoint for job progress and errors.

### Acceptance criteria

- The import includes no game outside the exact 30-day window.
- No more than the 100 most recent eligible games are selected.
- API requests are serial and use only the expected Chess.com host and constructed paths.
- Retrying a job does not duplicate games.
- Status distinguishes successful, partial, paused, and failed work.

## Story 4: Replay PGNs and produce analysis positions

**As the analysis workflow,** I need valid positions and the configured player's moves from each imported game.

### Tasks

1. Use the existing `chess.js` dependency to parse and replay standard-chess PGNs.
2. Validate every move and identify the configured player's color from the game headers/metadata.
3. For each configured-player turn, record the pre-move FEN, actual move, ply, and enough game context to verify provenance.
4. Mark malformed PGNs or games that cannot be replayed as skipped with a reason; continue processing the rest of the job.
5. Add unit fixtures for both colors, castling, en passant, promotions, checkmate, and malformed/unsupported PGNs.

### Acceptance criteria

- Replayed positions and plies match known PGN fixtures.
- Only positions where the configured player is to move enter engine analysis.
- A malformed game does not corrupt or block the rest of the import.

## Story 5: Analyze positions in the browser and resume safely

**As a user,** I want all selected games analyzed without blocking the UI, with progress saved so I can return later.

### Tasks

1. Integrate the proven Stockfish worker and expose a typed client-side analysis interface.
2. Analyze every recorded configured-player position using the fixed, versioned settings from Story 0.
3. Compare best-move and played-move evaluations from the same side-to-move perspective.
4. Create a missed-move candidate when evaluation loss is at least 150 centipawns; a mate-score loss qualifies as exceeding the threshold. Do not require a forced material gain.
5. Persist progress checkpoints and candidate results in bounded batches. Make writes idempotent so a resumed position cannot create duplicate puzzles.
6. On tab close or reload, mark work paused; on return, continue at the next unprocessed position.
7. Show processed/total positions and counts for candidates, skipped positions, and failures.
8. Record Stockfish version, analysis settings, score loss, and rating-formula version for each candidate.

### Acceptance criteria

- Analysis runs in a Web Worker and keeps the interface responsive.
- Closing the tab stops analysis; reopening resumes from persisted progress.
- The workflow eventually analyzes every eligible position in the selected games.
- Candidate creation follows the 150-centipawn/mate-score rule and does not duplicate on retries.
- Engine failures can be retried without restarting completed work.

## Story 6: Rate and practice the private puzzle category

**As a user,** I want generated puzzles in a dedicated category with difficulty-based selection and independent progress.

### Tasks

1. Define and version a Stockfish-feature heuristic that maps a generated puzzle to an initial estimated rating on Lychee's puzzle scale.
2. Add the **user games puzzles** category to the dashboard/navigation and expose its puzzle queue.
3. Implement next-puzzle selection using only this user's generated puzzles and the category's separate Glicko-2 rating.
4. Add puzzle submission handling for the stored solution line, success/failure, solve order, and review state.
5. Update only the **user games puzzles** Glicko-2 rating and category history. Do not update shared overall or shared theme ratings.
6. Preserve source-game attribution and make the source game link available after solving.
7. Ensure empty, active, completed, and all-puzzles-solved states are handled.

### Acceptance criteria

- A user can solve generated puzzles and see correct move feedback and source attribution.
- Category difficulty selection uses the category rating and does not read or update the shared overall rating.
- Generated puzzles and review state remain private to the owning user.
- Existing Lichess puzzle flows and ratings remain unchanged.

## Story 7: Delete imported data and harden end-to-end behavior

**As a user,** I want to remove my imported game-derived data when I no longer want it stored.

### Tasks

1. Add an explicit delete action with confirmation.
2. Delete the user's related import jobs, PGNs, analysis results, generated puzzles, solve/review state, and category rating/history.
3. Ensure deletion is scoped to the authenticated user and cannot affect another user's records or shared puzzles.
4. Add integration tests for settings, import retries, ownership isolation, job resume, puzzle submission, category-rating isolation, and deletion.
5. Run formatting, Jest tests, TypeScript checks, lint, and production build; inspect the final diff.

### Acceptance criteria

- Deletion removes all game-derived records and resets this category's progress/rating for that user.
- Shared Lichess puzzle data, ratings, and other users' data are unchanged.
- The full import-to-practice flow passes with mocked Chess.com API responses and deterministic engine fixtures.

## Cross-cutting implementation notes

- Likely application areas: `app/` for settings, import/status APIs, and pages; `components/` for settings, progress, and puzzle UI; `lib/schema.ts`, `lib/db.ts`, and `lib/store.ts` for persistence; `src/` for analysis/rating logic; `test/` for unit and integration coverage.
- Keep schema declarations and bootstrap DDL aligned. Add upgrade logic for deployed databases; `CREATE TABLE IF NOT EXISTS` alone does not alter existing tables.
- Do not place private game-derived puzzles in the global `puzzles` / `puzzle_themes` corpus.
- Keep server-side Stockfish, server workers, and analysis while the browser is closed out of first-release implementation.
