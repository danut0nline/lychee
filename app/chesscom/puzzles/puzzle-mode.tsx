'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Puzzle } from '@/types/lichess-api';
import { PuzzleContext } from '@/components/puzzle-ui/puzzle-mode';
import PuzzleBoard from '@/components/puzzle-ui/puzzle-board';
import type { Rating } from '@/src/rating/getRating';

type PrivatePuzzle = {
  id: string;
  fen: string;
  solutionLine: string;
};

type Props = { initialRating: Rating };

export default function ChesscomPuzzleMode({ initialRating }: Props) {
  const [puzzle, setPuzzle] = useState<Puzzle>();
  const [rating, setRating] = useState<Rating>(initialRating);
  const [sourceGameUrl, setSourceGameUrl] = useState<string>();
  const [emptyState, setEmptyState] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadNextPuzzle = useCallback(async () => {
    setLoading(true);
    setError('');
    setSourceGameUrl(undefined);
    try {
      const response = await fetch('/api/chesscom/puzzle/next', {
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? 'Could not load a puzzle.');
      setRating(result.rating as Rating);
      setEmptyState(result.emptyState as string | undefined);
      const nextPuzzle = result.puzzle as PrivatePuzzle | null;
      setPuzzle(nextPuzzle ? toDisplayPuzzle(nextPuzzle) : undefined);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load a puzzle.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNextPuzzle();
  }, [loadNextPuzzle]);

  const submitPuzzle = async (
    success: boolean,
    time: number
  ): Promise<Rating> => {
    if (!puzzle) throw new Error('No active game puzzle.');
    const response = await fetch('/api/chesscom/puzzle/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        puzzleId: puzzle.PuzzleId,
        success,
        time,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ?? 'Puzzle result could not be saved.');
    }
    setRating(result.rating as Rating);
    setSourceGameUrl(result.sourceGameUrl as string);
    setPuzzle((current) =>
      current ? { ...current, Rating: result.puzzleRating as number } : current
    );
    return result.rating as Rating;
  };

  if (loading && !puzzle) {
    return (
      <p className='py-12 text-center text-muted-foreground'>Loading puzzle…</p>
    );
  }
  if (!puzzle) {
    return (
      <section className='mx-auto max-w-xl space-y-4 rounded-lg border p-8 text-center'>
        <h2 className='text-xl font-semibold'>
          {error
            ? 'Could not load game puzzles'
            : emptyState === 'no-puzzles'
              ? 'No game puzzles yet'
              : 'No game puzzles are due'}
        </h2>
        <p className='text-muted-foreground'>
          {error ||
            (emptyState === 'no-puzzles'
              ? 'Import recent Chess.com games and analyze them to create private puzzles.'
              : 'Your generated puzzles are solved or waiting for review. Come back when the next review is due.')}
        </p>
        {error ? (
          <Button type='button' onClick={() => void loadNextPuzzle()}>
            Try again
          </Button>
        ) : (
          <Link href='/chesscom'>
            <Button>Manage imports</Button>
          </Link>
        )}
      </section>
    );
  }

  return (
    <PuzzleContext.Provider
      value={{
        submitNextPuzzle: submitPuzzle,
        getNextPuzzle: () => {
          void loadNextPuzzle();
        },
      }}
    >
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      <PuzzleBoard
        puzzle={puzzle}
        initialRating={rating}
        loading={loading}
        playerMovesFirst
        sourceGameUrl={sourceGameUrl}
      />
    </PuzzleContext.Provider>
  );
}

function toDisplayPuzzle(privatePuzzle: PrivatePuzzle): Puzzle {
  return {
    PuzzleId: privatePuzzle.id,
    FEN: privatePuzzle.fen,
    Moves: privatePuzzle.solutionLine,
    Rating: 1500,
    RatingDeviation: 80,
    Popularity: 0,
    NbPlays: 0,
    Themes: 'userGamesPuzzles',
    GameUrl: '',
    hierarchy_tags: 'userGamesPuzzles',
  };
}
