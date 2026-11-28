import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { deleteChesscomData } from '@/lib/store';

export async function DELETE() {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to delete imported game data.' },
      { status: 401 }
    );
  }

  await deleteChesscomData(user.id);
  return NextResponse.json(
    { deleted: true, settingPreserved: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
