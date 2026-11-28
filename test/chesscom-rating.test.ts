import { estimateChesscomPuzzleRating } from '@/src/chesscom/rating';

describe('Chess.com game puzzle rating estimate', () => {
  it('maps engine loss to the bounded initial rating scale', () => {
    expect(estimateChesscomPuzzleRating(-10)).toBe(1200);
    expect(estimateChesscomPuzzleRating(150)).toBe(1238);
    expect(estimateChesscomPuzzleRating(800)).toBe(1400);
    expect(estimateChesscomPuzzleRating(10_000)).toBe(1400);
  });
});
