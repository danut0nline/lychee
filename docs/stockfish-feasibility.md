# Stockfish browser-analysis feasibility

## Selected distribution

- Package: `stockfish` 19.0.1 (`stockfish.js`, Stockfish 19).
- Build: `lite-single`, the package's single-threaded WASM engine.
- Package documentation describes this distribution as maintained, supports
  modern browsers, and recommends the lite single-threaded build for ordinary
  browser use. Its `.js` worker entry and matching `.wasm` file must be served
  together.
- The single-threaded build avoids `SharedArrayBuffer` and the
  `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers required
  by the multithreaded builds.
- The package is GPL-3.0. The matching `Copying.txt` is copied alongside the
  public engine assets. Confirm distribution obligations before release.

The dependency is pinned to 19.0.1. `scripts/copy-stockfish-assets.cjs` copies
only the selected engine JS, WASM, and license into the ignored
`public/stockfish/` directory before `npm run dev` and `npm run build`. The
engine loads its WASM relative to the worker script URL, so the files remain
siblings in both environments.

## UCI contract

- Worker URL: `/stockfish/stockfish-19-lite-single.js`.
- Input: a standard FEN position.
- Setup: send `uci`; after `uciok`, set a 16 MiB hash, one thread, `ucinewgame`,
  and `isready`; after `readyok`, send `position fen …` and `go depth 12`.
- Output: the latest unbounded `info … score cp|mate … pv …` line and the
  following `bestmove` line. Scores are recorded from the side-to-move
  perspective, and the legal principal variation is retained as the candidate
  puzzle solution.
- The lite single-threaded build is used for repeatable single-thread search.
  The version, hash size, thread count, and depth are constants in
  `src/stockfish/analysis.ts`.
- Aborting terminates the worker; a later analysis creates a fresh worker.
  Worker errors and a 60-second timeout reject the request.

For a played move, replay it with `chess.js`, analyze the resulting position,
and negate its score so both evaluations are from the original mover's
perspective. Centipawn loss is `best score - played score`. Centipawn losses of
150 or more qualify. A positive loss involving a mate score also qualifies.

## Initial puzzle-rating proposal

Version `stockfish-feature-v1` is a provisional, uncalibrated starting point:

```text
estimatedRating = clamp(800, 2800, 1200 + round(0.25 * min(lossCentipawns, 800)))
```

This uses only the engine-derived severity available in the first prototype.
It is not a calibrated difficulty estimate; replace or tune it using solve
outcomes in the private category and increment the formula version when it
changes.

## Verification status

- Package metadata and its bundled documentation identify the selected engine
  as Stockfish.js 19 / Stockfish 19 and document the browser worker protocol.
- Unit coverage is added for the UCI worker contract with a deterministic
  worker fixture, score parsing, perspective inversion, the centipawn
  threshold, and mate-score qualification.
- Development and production browser loading, legal best-move behavior,
  termination in a real browser, and representative-position timing still need
  runtime verification before this feasibility spike is considered complete.
