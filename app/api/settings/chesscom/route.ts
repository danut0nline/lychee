import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { getChesscomUsername, saveChesscomUsername } from '@/lib/store';
import {
  chesscomProfileUrl,
  normalizeChesscomUsername,
} from '@/src/chesscom/username';

const CHESSCOM_USER_AGENT =
  'LycheeChessPuzzles/0.1 (+https://github.com/ahmedmahmud/lychee)';

function responseError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

export async function GET() {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user)
    return responseError('Sign in to manage your Chess.com setting.', 401);

  const username = await getChesscomUsername(user.id);
  return NextResponse.json(
    { username: username ?? null },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function PUT(request: NextRequest) {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user)
    return responseError('Sign in to manage your Chess.com setting.', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return responseError('Send a JSON object with a username field.', 400);
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !Object.prototype.hasOwnProperty.call(body, 'username')
  ) {
    return responseError('Send a JSON object with a username field.', 400);
  }

  const rawUsername = (body as { username: unknown }).username;
  if (rawUsername === null || rawUsername === '') {
    await saveChesscomUsername(user.id, null);
    return NextResponse.json(
      { username: null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const username = normalizeChesscomUsername(rawUsername);
  if (!username) {
    return responseError(
      'Use a Chess.com username containing 3-25 letters, numbers, underscores, or hyphens.',
      400
    );
  }

  let profileResponse: Response;
  try {
    profileResponse = await fetch(chesscomProfileUrl(username), {
      headers: { 'User-Agent': CHESSCOM_USER_AGENT },
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    return responseError(
      'Chess.com could not be reached. Check your connection and try again.',
      503
    );
  }

  if (profileResponse.status === 404) {
    return responseError(
      `No public Chess.com profile was found for "${username}". Check the spelling and try again.`,
      404
    );
  }
  if (profileResponse.status === 429) {
    return responseError(
      'Chess.com is rate-limiting profile checks. Wait a moment and try again.',
      429
    );
  }
  if (!profileResponse.ok) {
    return responseError(
      'Chess.com could not verify this public profile right now. Try again later.',
      503
    );
  }

  let profile: unknown;
  try {
    profile = await profileResponse.json();
  } catch {
    return responseError(
      'Chess.com returned an unreadable profile response. Try again later.',
      503
    );
  }

  if (
    !profile ||
    typeof profile !== 'object' ||
    typeof (profile as { username?: unknown }).username !== 'string'
  ) {
    return responseError(
      'Chess.com returned an invalid profile response. Try again later.',
      503
    );
  }

  const verifiedUsername = normalizeChesscomUsername(
    (profile as { username: string }).username
  );
  if (verifiedUsername !== username) {
    return responseError(
      'Chess.com returned a different profile than requested. Check the username and try again.',
      502
    );
  }

  await saveChesscomUsername(user.id, username);
  return NextResponse.json(
    { username, ownershipVerified: false },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
