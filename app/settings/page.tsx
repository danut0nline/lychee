import { redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';
import { getChesscomUsername } from '@/lib/store';
import ChesscomSettingsForm from './settings-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { user } = await validateRequest();
  if (!user) redirect('/unauthorized');

  const username = await getChesscomUsername(user.id);
  return (
    <main className='mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-8 px-4 py-12'>
      <header className='space-y-2'>
        <h1 className='text-4xl font-extrabold tracking-tight'>Settings</h1>
        <p className='text-muted-foreground'>
          Manage the public account Lychee will use for future Chess.com game
          imports.
        </p>
      </header>
      <ChesscomSettingsForm initialUsername={username ?? ''} />
    </main>
  );
}
