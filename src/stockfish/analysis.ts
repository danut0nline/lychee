import { Chess } from 'chess.js';

export type EngineScore =
  | { kind: 'centipawns'; value: number }
  | { kind: 'mate'; moves: number };

export type EngineAnalysis = {
  bestMove: string;
  principalVariation: string[];
  depth: number;
  score: EngineScore;
};

export type MoveLoss = {
  lossCentipawns: number;
  playedScore: EngineScore;
  isMissedMove: boolean;
};

export const STOCKFISH_VERSION = '19.0.1';
export const STOCKFISH_ANALYSIS_DEPTH = 12;
export const STOCKFISH_HASH_MB = 16;
export const MISSED_MOVE_THRESHOLD_CENTIPAWNS = 150;
const MATE_SCORE_CENTIPAWNS = 30_000;
const ENGINE_TIMEOUT_MS = 60_000;
const ENGINE_WORKER_URL = '/stockfish/stockfish-19-lite-single.js';

export function parseUciScore(line: string): EngineScore | undefined {
  if (!line.startsWith('info ') || /\b(?:lowerbound|upperbound)\b/.test(line)) {
    return undefined;
  }

  const match = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)(?:\s|$)/);
  if (!match) return undefined;

  const value = Number(match[2]);
  return match[1] === 'mate'
    ? { kind: 'mate', moves: value }
    : { kind: 'centipawns', value };
}

function parseUciPrincipalVariation(line: string): string[] | undefined {
  const match = line.match(/\bpv\s+(.+)$/);
  if (!match) return undefined;
  const moves = match[1].trim().split(/\s+/);
  return moves.length > 0 &&
    moves.every((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
    ? moves
    : undefined;
}

export function invertScore(score: EngineScore): EngineScore {
  return score.kind === 'mate'
    ? { kind: 'mate', moves: -score.moves }
    : { kind: 'centipawns', value: -score.value };
}

function scoreAsCentipawns(score: EngineScore): number {
  if (score.kind === 'centipawns') return score.value;

  const mateDistance = Math.min(Math.abs(score.moves), 1_000);
  const magnitude = MATE_SCORE_CENTIPAWNS - mateDistance;
  return score.moves < 0 ? -magnitude : magnitude;
}

export function compareMoveScores(
  bestMoveScore: EngineScore,
  playedPositionScore: EngineScore
): MoveLoss {
  // UCI scores are relative to the side to move. The played position is after
  // the user's move, so flip its score to compare both from the user's view.
  const playedScore = invertScore(playedPositionScore);
  const lossCentipawns =
    scoreAsCentipawns(bestMoveScore) - scoreAsCentipawns(playedScore);
  const hasMateScore =
    bestMoveScore.kind === 'mate' || playedScore.kind === 'mate';

  return {
    lossCentipawns,
    playedScore,
    isMissedMove:
      lossCentipawns > 0 &&
      (hasMateScore || lossCentipawns >= MISSED_MOVE_THRESHOLD_CENTIPAWNS),
  };
}

export function analyzeFen(
  fen: string,
  options: { depth?: number; signal?: AbortSignal } = {}
): Promise<EngineAnalysis> {
  if (!fen.trim()) return Promise.reject(new Error('A FEN is required.'));

  let positionFen: string;
  try {
    positionFen = new Chess(fen).fen();
  } catch {
    return Promise.reject(new Error('The supplied FEN is invalid.'));
  }

  const depth = options.depth ?? STOCKFISH_ANALYSIS_DEPTH;
  if (!Number.isInteger(depth) || depth < 1 || depth > 30) {
    return Promise.reject(
      new Error('Analysis depth must be between 1 and 30.')
    );
  }

  if (options.signal?.aborted) {
    return Promise.reject(new DOMException('Analysis aborted.', 'AbortError'));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(ENGINE_WORKER_URL);
    let latestScore: EngineScore | undefined;
    let latestPrincipalVariation: string[] | undefined;
    let latestDepth = 0;
    let finished = false;

    const timeout = window.setTimeout(() => {
      finish(new Error('Stockfish analysis timed out.'));
    }, ENGINE_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      worker.terminate();
    };

    const finish = (error?: Error, result?: EngineAnalysis) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error('Stockfish returned no analysis result.'));
    };

    const abort = () => {
      worker.postMessage('stop');
      finish(new DOMException('Analysis aborted.', 'AbortError'));
    };

    options.signal?.addEventListener('abort', abort, { once: true });
    worker.addEventListener('error', (event) => {
      finish(new Error(event.message || 'Stockfish worker failed.'));
    });
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      const line =
        typeof event.data === 'string' ? event.data : String(event.data);

      if (line === 'uciok') {
        worker.postMessage(`setoption name Hash value ${STOCKFISH_HASH_MB}`);
        worker.postMessage('setoption name Threads value 1');
        worker.postMessage('ucinewgame');
        worker.postMessage('isready');
        return;
      }

      if (line === 'readyok') {
        worker.postMessage(`position fen ${positionFen}`);
        worker.postMessage(`go depth ${depth}`);
        return;
      }

      const score = parseUciScore(line);
      const principalVariation = parseUciPrincipalVariation(line);
      const depthMatch = line.match(/\bdepth\s+(\d+)\b/);
      const reportedDepth = depthMatch ? Number(depthMatch[1]) : 0;
      if (score && reportedDepth >= latestDepth) {
        latestDepth = reportedDepth;
        latestScore = score;
        latestPrincipalVariation = principalVariation;
      }

      const bestMoveMatch = line.match(/\bbestmove\s+(\S+)/);
      if (bestMoveMatch) {
        if (!latestScore || bestMoveMatch[1] === '(none)') {
          finish(new Error('Stockfish returned no legal best move or score.'));
          return;
        }

        const moveMatch = bestMoveMatch[1].match(
          /^([a-h][1-8])([a-h][1-8])([qrbn])?$/
        );
        const game = new Chess(positionFen);
        let legalMove = false;
        if (moveMatch) {
          try {
            game.move({
              from: moveMatch[1],
              to: moveMatch[2],
              ...(moveMatch[3] ? { promotion: moveMatch[3] } : {}),
            });
            legalMove = true;
          } catch {
            // Reject the result below if the engine returned an illegal move.
          }
        }

        if (!legalMove) {
          finish(new Error('Stockfish returned an illegal best move.'));
          return;
        }

        const candidateVariation =
          latestPrincipalVariation?.[0] === bestMoveMatch[1]
            ? latestPrincipalVariation
            : [bestMoveMatch[1]];
        const variationGame = new Chess(positionFen);
        try {
          for (const move of candidateVariation) {
            variationGame.move({
              from: move.slice(0, 2),
              to: move.slice(2, 4),
              ...(move[4] ? { promotion: move[4] } : {}),
            });
          }
        } catch {
          finish(
            new Error('Stockfish returned an illegal principal variation.')
          );
          return;
        }

        finish(undefined, {
          bestMove: bestMoveMatch[1],
          principalVariation: candidateVariation,
          depth: latestDepth,
          score: latestScore,
        });
      }
    });

    worker.postMessage('uci');
  });
}

export async function analyzePlayedMove(
  fen: string,
  playedMoveUci: string,
  signal?: AbortSignal
): Promise<{
  bestMove: string;
  bestScore: EngineScore;
  principalVariation: string[];
  playedPositionScore: EngineScore;
  moveLoss: MoveLoss;
}> {
  const moveMatch = playedMoveUci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!moveMatch) {
    throw new Error('The played move must be a UCI coordinate move.');
  }

  const game = new Chess(fen);
  try {
    game.move({
      from: moveMatch[1],
      to: moveMatch[2],
      ...(moveMatch[3] ? { promotion: moveMatch[3] } : {}),
    });
  } catch {
    throw new Error('The played move is illegal in this position.');
  }

  const bestPosition = await analyzeFen(fen, { signal });
  const playedPositionScore = game.isCheckmate()
    ? { kind: 'mate' as const, moves: -1 }
    : (await analyzeFen(game.fen(), { signal })).score;
  return {
    bestMove: bestPosition.bestMove,
    bestScore: bestPosition.score,
    principalVariation: bestPosition.principalVariation,
    playedPositionScore,
    moveLoss: compareMoveScores(bestPosition.score, playedPositionScore),
  };
}
