# Functional Specification: Chess.com Game Puzzles

**Status:** Draft  
**Purpose:** Let Lychee users import recent public Chess.com games and practice engine-selected missed-move puzzles from those games.

## Goals

- Use a Chess.com username configured in Lychee settings as the source for game imports.
- Find significant missed moves by analyzing the configured player's games with Stockfish.
- Let users practice generated puzzles within Lychee.
- Keep this training pool and its rating separate from the shared Lichess puzzle pool and rating.

## First-release scope

- Import completed standard-chess games from the most recent 30 days.
- Process at most the 100 most recent eligible games in that window.
- Analyze every move made by the configured player in those games.
- Generate a missed-move puzzle when the engine's best move is at least 150 centipawns better than the move played.
- Use Browser Stockfish analysis only. Analysis pauses when the browser tab closes and resumes from saved progress when the user returns.
- Defer server-side Stockfish and the engine-location setting until Lychee has suitable worker infrastructure.
- Keep imported games and generated puzzles private to the Lychee user who started the import.
- Do not change Lychee's shared overall rating or shared Lichess puzzle selection.

## User experience

1. The signed-in user saves a Chess.com username in Lychee's settings.
2. Lychee validates the username and shows the configured public account. Lychee does not verify account ownership.
3. The user opens **My Games** and starts an import from the configured account.
4. Lychee shows fetching and analysis progress, including the number of games imported, analyzed, skipped, and puzzles generated.
5. If the user closes the tab, analysis pauses. Returning to **My Games** resumes from the saved checkpoint.
6. The user practices puzzles in the **user games puzzles** category and can open each source Chess.com game.

## Functional requirements

### Game import

- Use Chess.com's public, read-only Published-Data API. Do not request or store Chess.com passwords or tokens.
- Discover available monthly archives and fetch only archives overlapping the 30-day window. Filter individual games to the exact cutoff.
- Select the 100 most recent eligible games. Include completed standard chess only; skip variants and unfinished games.
- Fetch archives serially, use a recognizable User-Agent, and handle rate limits and temporary failures without losing completed work.
- Validate and canonicalize the configured username before constructing API URLs.
- Store the configured Chess.com username in the signed-in user's Lychee settings. Use it for imports rather than asking for a username each time.
- When the configured username changes, use the new account for future imports. Keep old imported games and puzzles with their original source username until the user explicitly deletes them.
- Provide an explicit action to delete imported games, generated puzzles, analysis data, solve/review progress, and the **user games puzzles** rating history and rating.
- Make imports repeatable: importing the same game again must not create duplicate game or puzzle records.
- Clearly report invalid or unavailable accounts, empty archives, partial imports, and recoverable API failures.

### Puzzle generation

- Parse and replay each eligible PGN, retaining the game URL, date, time class, player colors, and move sequence needed for provenance.
- Analyze positions where the configured player was to move.
- Compare the engine's best move with the move actually played using a consistent score perspective and analysis configuration.
- Generate a puzzle when the played move has an engine evaluation loss of at least 150 centipawns relative to the best move. Mate-score losses count as exceeding the threshold.
- Do not require the line to prove a forced material gain or mate. These are **missed-move puzzles** and may include positional mistakes, not only tactics.
- Store the puzzle position, side to move, solution line, source game URL, ply, played move, engine evaluation, engine version, and rating-formula version.
- Avoid duplicate puzzles for the same source game and move.
- Label puzzles as Lychee-generated; do not present engine analysis as Chess.com-provided analysis.

### Browser analysis and resumability

- Run Stockfish in a Web Worker so analysis does not block the interface.
- Analyze all eligible moves from the selected games, even if this requires multiple visits.
- Persist job status and checkpoints often enough to resume at the next unprocessed position after a tab closes or the browser reloads.
- Show progress and distinguish queued, fetching, analyzing, paused, completed, partially failed, and failed states.
- Do not claim analysis continues while the browser is closed.
- Server-side Stockfish and any engine-location setting are out of scope for the first release.

### Practice, ratings, and privacy

- Provide a **user games puzzles** category for browsing and practicing generated puzzles.
- Estimate each generated puzzle's initial difficulty on Lychee's puzzle-rating scale using a relative Stockfish-feature heuristic. Treat this as an estimate, not a calibrated rating.
- Use a separate Glicko-2 rating for the **user games puzzles** category. Use that rating to select difficulty within this category.
- Do not update the shared overall Lychee rating, shared theme ratings, or shared Lichess puzzle selection from generated-puzzle results.
- Keep imported games, analysis results, generated puzzles, solve/review progress, and category ratings scoped to the authenticated Lychee user. Do not trust a client-supplied owner identifier.
- Prevent one Lychee user from viewing or practicing another user's imported puzzles.

## Acceptance criteria

- A signed-in user can configure a valid public Chess.com username and import eligible games from the last 30 days without providing Chess.com credentials.
- At most the 100 most recent eligible games are processed; the import reports when additional games were outside the cap.
- Games are filtered to the exact 30-day cutoff, including when a fetched monthly archive contains older games.
- Invalid usernames, empty archives, rate limits, and partial failures produce understandable status messages.
- Repeating an import does not duplicate games or puzzles.
- Analysis covers every configured-player move in the selected games and can resume after the tab closes and the user returns.
- A generated puzzle has a valid position, legal solution line, source game link, and recorded evaluation loss of at least 150 centipawns (or a qualifying mate-score loss).
- Generated-puzzle outcomes update only the **user games puzzles** Glicko-2 rating; the shared Lychee rating and Lichess puzzle selection remain unchanged.
- Explicit deletion removes the user's imported game-derived data and category rating/progress.
- Existing Lichess puzzle training remains available and unchanged.

## Out of scope for the first release

- Chess.com account OAuth or access to private games.
- Verifying that the configured username belongs to the signed-in Lychee user.
- Importing all historical games or processing more than 100 eligible games per import.
- Non-standard chess variants.
- Server-side Stockfish, background execution while the browser is closed, or an engine-location setting.
- Sending moves or other commands to Chess.com.
- Replacing or adding private generated puzzles to the shared Lichess puzzle corpus.
