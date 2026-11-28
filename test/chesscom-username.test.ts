import {
  chesscomProfileUrl,
  normalizeChesscomUsername,
} from '@/src/chesscom/username';

describe('Chess.com username handling', () => {
  it('trims and normalizes valid usernames', () => {
    expect(normalizeChesscomUsername('  Magnus_Carlsen ')).toBe(
      'magnus_carlsen'
    );
    expect(normalizeChesscomUsername('player-123')).toBe('player-123');
  });

  it('rejects malformed and non-string usernames', () => {
    expect(normalizeChesscomUsername('ab')).toBeNull();
    expect(normalizeChesscomUsername('name/other')).toBeNull();
    expect(normalizeChesscomUsername('a'.repeat(26))).toBeNull();
    expect(normalizeChesscomUsername({ username: 'player' })).toBeNull();
  });

  it('builds the profile request against the fixed Chess.com API host', () => {
    expect(chesscomProfileUrl('player-123')).toBe(
      'https://api.chess.com/pub/player/player-123'
    );
  });
});
