import {
  selectOverlappingArchives,
  selectRecentEligibleGames,
} from '@/src/chesscom/import';

describe('Chess.com archive selection', () => {
  const now = Date.UTC(2025, 2, 1, 12);
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  const username = 'player';

  it('keeps only trusted archive URLs for months overlapping the 30-day window', () => {
    const result = selectOverlappingArchives(
      [
        'https://api.chess.com/pub/player/player/games/2025/01',
        'https://api.chess.com/pub/player/player/games/2025/02',
        'https://api.chess.com/pub/player/player/games/2025/03',
        'https://example.com/pub/player/player/games/2025/03',
        'https://api.chess.com/pub/player/other/games/2025/03',
        'https://api.chess.com/pub/player/player/games/not-a-year/03',
        'https://user@api.chess.com/pub/player/player/games/2025/03',
        'https://api.chess.com/pub/player/player/games/2025/03?redirect=1',
        'https://api.chess.com//pub/player/player/games/2025/03',
      ],
      username,
      cutoff,
      now
    );
    expect(result).toEqual([
      'https://api.chess.com/pub/player/player/games/2025/01',
      'https://api.chess.com/pub/player/player/games/2025/02',
      'https://api.chess.com/pub/player/player/games/2025/03',
    ]);
  });

  it('filters games by account, date, rules, completion, and keeps the newest 100', () => {
    const games = Array.from({ length: 104 }, (_, index) => ({
      url: `https://www.chess.com/game/live/${index}`,
      pgn: '[Event "Test"]',
      end_time: Math.floor((cutoff + index * 1000) / 1000),
      time_class: 'rapid',
      rules: 'chess',
      white: { username, rating: 1500, result: 'win' },
      black: { username: 'opponent', rating: 1600, result: 'checkmated' },
    }));

    games.push(
      {
        ...games[0],
        url: 'https://www.chess.com/game/live/variant',
        rules: 'chess960',
      },
      {
        ...games[0],
        url: 'https://www.chess.com/game/live/unfinished',
        white: { ...games[0].white, result: '*' },
      },
      {
        ...games[0],
        url: 'https://www.chess.com/game/live/wrong-player',
        white: { ...games[0].white, username: 'someone-else' },
        black: { ...games[0].black, username: 'opponent' },
      },
      {
        ...games[0],
        url: 'https://evil.example/game/live/not-chesscom',
      },
      {
        ...games[0],
        url: 'https://www.chess.com/game/live/extra/segment',
      },
      {
        ...games[0],
        url: 'https://user@www.chess.com/game/live/123',
      },
      {
        ...games[0],
        url: 'https://www.chess.com/game/live/123?redirect=1',
      },
      {
        ...games[0],
        url: 'https://www.chess.com/game/live/outside-window',
        end_time: Math.floor((cutoff - 1000) / 1000),
      }
    );

    const selected = selectRecentEligibleGames(games, username, cutoff, now);
    expect(selected).toHaveLength(100);
    expect(selected[0].url).toBe('https://www.chess.com/game/live/103');
    expect(selected.at(-1)?.url).toBe('https://www.chess.com/game/live/4');
  });
});
