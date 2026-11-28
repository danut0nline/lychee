import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { validateRequest } from '@/lib/auth';
import ChesscomPuzzleMode from './puzzle-mode';
import { CHESSCOM_INITIAL_RATING } from '@/src/chesscom/rating';
import { getChesscomRating } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function ChesscomPuzzlesPage() {
  const { user } = await validateRequest();
  if (!user) redirect('/unauthorized');

  const rating = (await getChesscomRating(user.id)) ?? CHESSCOM_INITIAL_RATING;
  return (
    <main className='mx-auto min-h-svh w-full max-w-5xl px-4 py-8'>
      <header className='mb-4 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-3xl font-extrabold tracking-tight'>
            User games puzzles
          </h1>
          <p className='text-sm text-muted-foreground'>
            Private puzzles from your imported Chess.com games.
          </p>
        </div>
        <Link href='/chesscom'>
          <Button variant='outline'>Manage imports</Button>
        </Link>
      </header>
      <ChesscomPuzzleMode initialRating={rating} />
    </main>
  );
}
