import { dbConnect } from '@/lib/db';
import React from 'react';
import { validateRequest } from '@/lib/auth';
import { getExistingUserRating } from '@/src/rating/getRating';
import WoodpeckerLoader from '@/components/woodpecker/loader';

export default async function TestBoard() {
  await dbConnect();
  const { user } = await validateRequest();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const rating = await getExistingUserRating(user);
  return <WoodpeckerLoader rating={rating} />;
}
