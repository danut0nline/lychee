import { Chess } from 'chess.js';

export type ChesscomPlayerColor = 'w' | 'b';

export type ChesscomReplayInput = {
  pgn: string;
  sourceUsername: string;
  whiteUsername: string;
  blackUsername: string;
};

export type ChesscomAnalysisPosition = {
  ply: number;
  fen: string;
  playedMove: string;
  color: ChesscomPlayerColor;
};

export type ChesscomReplayResult = {
  color: ChesscomPlayerColor;
  positions: ChesscomAnalysisPosition[];
};

const normalizedName = (name: string) => name.trim().toLowerCase();

export function replayConfiguredPlayerMoves(
  input: ChesscomReplayInput
): ChesscomReplayResult {
  const configuredName = normalizedName(input.sourceUsername);
  const whiteName = normalizedName(input.whiteUsername);
  const blackName = normalizedName(input.blackUsername);
  if (!configuredName || !whiteName || !blackName) {
    throw new Error('Game player names are missing.');
  }
  if (whiteName === blackName) {
    throw new Error('Game metadata has ambiguous player names.');
  }

  const color: ChesscomPlayerColor | undefined =
    configuredName === whiteName
      ? 'w'
      : configuredName === blackName
        ? 'b'
        : undefined;
  if (!color) {
    throw new Error('The configured Chess.com account is not a game player.');
  }

  const game = new Chess();
  try {
    game.loadPgn(input.pgn, { strict: true });
  } catch {
    throw new Error('PGN is malformed or contains unsupported moves.');
  }

  const headers = game.header();
  if (
    (headers.White && normalizedName(headers.White) !== whiteName) ||
    (headers.Black && normalizedName(headers.Black) !== blackName)
  ) {
    throw new Error(
      'PGN player headers do not match the imported game metadata.'
    );
  }

  const positions = game
    .history({ verbose: true })
    .flatMap((move, index): ChesscomAnalysisPosition[] =>
      move.color === color
        ? [
            {
              ply: index + 1,
              fen: move.before,
              playedMove: move.lan,
              color,
            },
          ]
        : []
    );

  return { color, positions };
}
