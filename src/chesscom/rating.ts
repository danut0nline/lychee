export const CHESSCOM_RATING_FORMULA_VERSION = 'stockfish-feature-v1';
export const CHESSCOM_INITIAL_RATING = {
  rating: 1500,
  ratingDeviation: 350,
  volatility: 0.09,
  numberOfResults: 0,
};
const MIN_RATING = 800;
const MAX_RATING = 2800;

export function estimateChesscomPuzzleRating(lossCentipawns: number): number {
  const boundedLoss = Math.min(Math.max(lossCentipawns, 0), 800);
  const estimate = 1200 + Math.round(0.25 * boundedLoss);
  return Math.min(MAX_RATING, Math.max(MIN_RATING, estimate));
}
