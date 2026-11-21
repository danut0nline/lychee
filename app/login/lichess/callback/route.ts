import { OAuth2RequestError } from 'arctic';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createSession, lichess } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { LichessUser } from '@/types/lichess-api';
import { fetchLichessRating } from '@/src/rating/getRating';
import {
  createInitialUserData,
  createUser,
  getUserByUsername,
} from '@/lib/store';
import type { User } from '@/lib/auth-types';

export async function GET(request: Request): Promise<Response> {
  await dbConnect();

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = cookies().get('lichess_oauth_state')?.value ?? null;
  const codeVerifier = cookies().get('lichess_oauth_code_validation')?.value;

  if (
    !code ||
    !state ||
    !storedState ||
    state !== storedState ||
    !codeVerifier
  ) {
    return new Response(
      "code or state don't match stored to those stored in cookies",
      {
        status: 400,
      }
    );
  }

  try {
    const tokens = await lichess.validateAuthorizationCode(code, codeVerifier);
    const lichessUserResponse = await fetch('https://lichess.org/api/account', {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    });

    const lichessUser: LichessUser = await lichessUserResponse.json();

    const existingUser = await getUserByUsername(lichessUser.id);

    if (existingUser) {
      await createSession(existingUser.id);
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/',
        },
      });
    }

    const userId = randomBytes(12).toString('base64url');
    const user: User = { id: userId, username: lichessUser.id };
    await createUser(user);
    const savedUser = await getUserByUsername(user.username);
    if (!savedUser) throw new Error('Failed to create the local user record.');

    // Initialise user rating.
    const userRating = await fetchLichessRating(savedUser);
    await createInitialUserData(savedUser.username, userRating);
    await createSession(savedUser.id);
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
      },
    });
  } catch (e) {
    if (
      e instanceof OAuth2RequestError &&
      e.message === 'bad_verification_code'
    ) {
      return new Response(JSON.stringify(e), {
        status: 400,
      });
    }
    return new Response(null, {
      status: 500,
    });
  }
}
