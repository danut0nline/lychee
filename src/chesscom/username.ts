const USERNAME_PATTERN = /^[a-z0-9_-]{3,25}$/i;

export function normalizeChesscomUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const username = value.trim();
  if (!USERNAME_PATTERN.test(username)) return null;
  return username.toLowerCase();
}

export function chesscomProfileUrl(username: string): string {
  return `https://api.chess.com/pub/player/${encodeURIComponent(username)}`;
}
