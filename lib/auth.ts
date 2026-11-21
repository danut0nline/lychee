import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BASE_URL } from '@/config/base-url';
import { Lichess } from 'arctic';
import { dbConnect } from './db';
import {
  createSession as insertSession,
  deleteSession,
  getSessionByTokenHash,
  getUserById,
  updateSessionExpiry,
} from './store';
import type { Session, User } from './auth-types';

const SESSION_COOKIE = 'auth_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

const hashSessionId = (sessionId: string): string =>
  createHash('sha256').update(sessionId).digest('hex');

const sessionCookieAttributes = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
});

const refreshSessionCookie = (id: string, expiresAt: Date): void => {
  try {
    cookies().set(SESSION_COOKIE, id, {
      ...sessionCookieAttributes(),
      expires: expiresAt,
    });
  } catch {
    // Next.js does not permit cookie writes while rendering a Server Component.
  }
};

const clearSessionCookie = (): void => {
  try {
    cookies().set(SESSION_COOKIE, '', {
      ...sessionCookieAttributes(),
      expires: new Date(0),
    });
  } catch {
    // Cookie clearing is best-effort during Server Component rendering.
  }
};

export const lichess = new Lichess(
  process.env.LICHESS_CLIENT_ID!,
  `${BASE_URL}/login/lichess/callback`
);

export const createSession = async (userId: string): Promise<Session> => {
  await dbConnect();
  const id = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await insertSession(hashSessionId(id), userId, expiresAt);
  cookies().set(SESSION_COOKIE, id, {
    ...sessionCookieAttributes(),
    expires: expiresAt,
  });
  return { id, userId, expiresAt };
};

export const validateRequest = cache(
  async (): Promise<
    { user: User; session: Session } | { user: null; session: null }
  > => {
    await dbConnect();
    const id = cookies().get(SESSION_COOKIE)?.value;
    if (!id) return { user: null, session: null };

    const tokenHash = hashSessionId(id);
    const storedSession = await getSessionByTokenHash(tokenHash);
    if (!storedSession) {
      clearSessionCookie();
      return { user: null, session: null };
    }

    const expiresAt = new Date(storedSession.expiresAt);
    if (expiresAt.getTime() <= Date.now()) {
      await deleteSession(tokenHash);
      clearSessionCookie();
      return { user: null, session: null };
    }

    const user = await getUserById(storedSession.userId);
    if (!user) {
      await deleteSession(tokenHash);
      return { user: null, session: null };
    }

    if (expiresAt.getTime() - Date.now() < SESSION_REFRESH_THRESHOLD_MS) {
      expiresAt.setTime(Date.now() + SESSION_DURATION_MS);
      await updateSessionExpiry(tokenHash, expiresAt);
      refreshSessionCookie(id, expiresAt);
    }

    return {
      user,
      session: { id, userId: user.id, expiresAt },
    };
  }
);

export async function logout(): Promise<{ error: string | null }> {
  const { session } = await validateRequest();
  if (!session) return { error: 'Unauthorized' };

  await deleteSession(hashSessionId(session.id));
  cookies().set(SESSION_COOKIE, '', {
    ...sessionCookieAttributes(),
    expires: new Date(0),
  });
  return redirect('/');
}
