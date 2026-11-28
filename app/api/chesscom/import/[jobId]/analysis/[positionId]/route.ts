import { randomUUID } from 'node:crypto';
import { Chess } from 'chess.js';
import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import {
  getChesscomImportJob,
  getJobChesscomAnalysisPosition,
  saveChesscomAnalysisFailure,
  saveChesscomAnalysisResult,
} from '@/lib/store';
import {
  compareMoveScores,
  STOCKFISH_ANALYSIS_DEPTH,
  STOCKFISH_HASH_MB,
  STOCKFISH_VERSION,
  type EngineScore,
} from '@/src/stockfish/analysis';
import {
  CHESSCOM_RATING_FORMULA_VERSION,
  estimateChesscomPuzzleRating,
} from '@/src/chesscom/rating';

type RouteContext = {
  params: { jobId: string; positionId: string };
};

function parseEngineScore(value: unknown): EngineScore | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const score = value as Record<string, unknown>;
  if (score.kind === 'centipawns' && typeof score.value === 'number') {
    return Number.isFinite(score.value)
      ? { kind: 'centipawns', value: score.value }
      : undefined;
  }
  if (score.kind === 'mate' && Number.isInteger(score.moves)) {
    return { kind: 'mate', moves: score.moves as number };
  }
  return undefined;
}

function isUciMove(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to save analysis.' },
      { status: 401 }
    );
  }

  const job = await getChesscomImportJob(user.id, params.jobId);
  if (!job) {
    return NextResponse.json(
      { error: 'Import job not found.' },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Send a valid JSON result.' },
      { status: 400 }
    );
  }
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: 'Send a valid JSON result.' },
      { status: 400 }
    );
  }

  if (typeof body.error === 'string') {
    const position = await getJobChesscomAnalysisPosition(
      user.id,
      job.id,
      params.positionId
    );
    if (!position) {
      return NextResponse.json(
        { error: 'Analysis position not found.' },
        { status: 404 }
      );
    }
    const saved = await saveChesscomAnalysisFailure(
      user.id,
      job.id,
      position.id,
      body.error
    );
    return NextResponse.json({ saved });
  }

  const bestScore = parseEngineScore(body.bestScore);
  const playedPositionScore = parseEngineScore(body.playedPositionScore);
  const bestMove = body.bestMove;
  const variation = body.principalVariation;
  if (
    !bestScore ||
    !playedPositionScore ||
    !isUciMove(bestMove) ||
    !Array.isArray(variation) ||
    variation.length === 0 ||
    variation.length > 100 ||
    !variation.every(isUciMove) ||
    variation[0] !== bestMove
  ) {
    return NextResponse.json(
      { error: 'The engine result has an invalid score or move line.' },
      { status: 400 }
    );
  }

  const position = await getJobChesscomAnalysisPosition(
    user.id,
    job.id,
    params.positionId
  );
  if (!position) {
    return NextResponse.json(
      { error: 'Analysis position not found.' },
      { status: 404 }
    );
  }

  const game = new Chess(position.fen);
  try {
    game.move({
      from: position.playedMove.slice(0, 2),
      to: position.playedMove.slice(2, 4),
      ...(position.playedMove[4] ? { promotion: position.playedMove[4] } : {}),
    });
    const pvGame = new Chess(position.fen);
    for (const move of variation) {
      pvGame.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        ...(move[4] ? { promotion: move[4] } : {}),
      });
    }
  } catch {
    return NextResponse.json(
      { error: 'The engine result contains an illegal move line.' },
      { status: 400 }
    );
  }

  const moveLoss = compareMoveScores(bestScore, playedPositionScore);
  const solutionMoves =
    variation.length % 2 === 0 ? variation.slice(0, -1) : variation;
  const candidate = moveLoss.isMissedMove
    ? {
        id: randomUUID(),
        solutionLine: solutionMoves.join(' '),
        estimatedRating: estimateChesscomPuzzleRating(moveLoss.lossCentipawns),
        stockfishVersion: STOCKFISH_VERSION,
        analysisSettings: JSON.stringify({
          depth: STOCKFISH_ANALYSIS_DEPTH,
          hashMb: STOCKFISH_HASH_MB,
          threads: 1,
        }),
        scoreLoss: JSON.stringify(moveLoss),
        ratingFormulaVersion: CHESSCOM_RATING_FORMULA_VERSION,
      }
    : undefined;

  const saved = await saveChesscomAnalysisResult(
    user.id,
    job.id,
    position.id,
    {
      bestMove,
      bestScore: JSON.stringify(bestScore),
      playedScore: JSON.stringify(moveLoss.playedScore),
      lossCentipawns: moveLoss.lossCentipawns,
    },
    candidate
  );
  return NextResponse.json({
    saved,
    lossCentipawns: moveLoss.lossCentipawns,
    isCandidate: Boolean(candidate),
    estimatedRating: candidate?.estimatedRating,
  });
}
