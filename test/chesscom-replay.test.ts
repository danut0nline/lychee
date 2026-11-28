import { replayConfiguredPlayerMoves } from '@/src/chesscom/replay';

const metadata = {
  sourceUsername: 'Player',
  whiteUsername: 'Player',
  blackUsername: 'Opponent',
};

describe('Chess.com PGN replay', () => {
  it('extracts only the configured white player positions with pre-move FEN and ply', () => {
    const result = replayConfiguredPlayerMoves({
      ...metadata,
      pgn: `[Event "Fixture"]
[White "Player"]
[Black "Opponent"]

1. e4 e5 2. Nf3 Nc6 1-0`,
    });

    expect(result.color).toBe('w');
    expect(
      result.positions.map(({ ply, playedMove }) => ({ ply, playedMove }))
    ).toEqual([
      { ply: 1, playedMove: 'e2e4' },
      { ply: 3, playedMove: 'g1f3' },
    ]);
    expect(result.positions[0].fen).toContain(' w ');
  });

  it('extracts black positions from metadata when the PGN has no player headers', () => {
    const result = replayConfiguredPlayerMoves({
      pgn: '1. e4 e5 2. Nf3 Nc6 1-0',
      sourceUsername: 'Opponent',
      whiteUsername: 'Player',
      blackUsername: 'Opponent',
    });

    expect(result.color).toBe('b');
    expect(
      result.positions.map(({ ply, playedMove }) => ({ ply, playedMove }))
    ).toEqual([
      { ply: 2, playedMove: 'e7e5' },
      { ply: 4, playedMove: 'b8c6' },
    ]);
  });

  it('records castling, en passant, and promotion moves as coordinate moves', () => {
    const castling = replayConfiguredPlayerMoves({
      ...metadata,
      pgn: `[White "Player"]
[Black "Opponent"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O 1-0`,
    });
    expect(castling.positions.at(-1)?.playedMove).toBe('e1g1');

    const enPassant = replayConfiguredPlayerMoves({
      pgn: `[White "Player"]
[Black "Opponent"]

1. e4 a6 2. e5 d5 3. exd6 1-0`,
      ...metadata,
    });
    expect(enPassant.positions.at(-1)?.playedMove).toBe('e5d6');
    expect(enPassant.positions.at(-1)?.fen).toContain(' w ');

    const promotion = replayConfiguredPlayerMoves({
      pgn: `[SetUp "1"]
[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]
[White "Player"]
[Black "Opponent"]

1. a8=Q+ 1-0`,
      ...metadata,
    });
    expect(promotion.positions[0].playedMove).toBe('a7a8q');
  });

  it('replays a checkmate and rejects malformed or mismatched PGNs', () => {
    const checkmate = replayConfiguredPlayerMoves({
      ...metadata,
      sourceUsername: 'Opponent',
      pgn: `[White "Player"]
[Black "Opponent"]

1. f3 e5 2. g4 Qh4# 0-1`,
    });
    expect(checkmate.positions.map((position) => position.playedMove)).toEqual([
      'e7e5',
      'd8h4',
    ]);

    expect(() =>
      replayConfiguredPlayerMoves({
        ...metadata,
        pgn: '1. e4 e5 2. NotAMove',
      })
    ).toThrow(/malformed|unsupported/i);
    expect(() =>
      replayConfiguredPlayerMoves({
        ...metadata,
        pgn: `[White "SomeoneElse"]
[Black "Opponent"]

1. e4 e5 1-0`,
      })
    ).toThrow(/headers do not match/i);
  });
});
