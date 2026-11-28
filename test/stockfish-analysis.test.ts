import {
  analyzeFen,
  compareMoveScores,
  invertScore,
  parseUciScore,
} from '@/src/stockfish/analysis';

describe('Stockfish UCI score handling', () => {
  it('parses centipawn and mate scores from info lines', () => {
    expect(parseUciScore('info depth 12 score cp 153 nodes 2000')).toEqual({
      kind: 'centipawns',
      value: 153,
    });
    expect(parseUciScore('info depth 12 score mate -3 nodes 2000')).toEqual({
      kind: 'mate',
      moves: -3,
    });
  });

  it('ignores bound scores and non-score lines', () => {
    expect(
      parseUciScore('info depth 12 score cp 150 lowerbound nodes 2000')
    ).toBeUndefined();
    expect(parseUciScore('bestmove e2e4')).toBeUndefined();
  });

  it('flips score perspective after the played move', () => {
    expect(invertScore({ kind: 'centipawns', value: -100 })).toEqual({
      kind: 'centipawns',
      value: 100,
    });
    expect(invertScore({ kind: 'mate', moves: 4 })).toEqual({
      kind: 'mate',
      moves: -4,
    });
  });

  it('uses the exact centipawn threshold and qualifies a positive mate loss', () => {
    expect(
      compareMoveScores(
        { kind: 'centipawns', value: 250 },
        { kind: 'centipawns', value: -100 }
      )
    ).toMatchObject({ lossCentipawns: 150, isMissedMove: true });

    expect(
      compareMoveScores(
        { kind: 'centipawns', value: 100 },
        { kind: 'centipawns', value: -249 }
      ).isMissedMove
    ).toBe(false);

    expect(
      compareMoveScores(
        { kind: 'centipawns', value: 0 },
        { kind: 'mate', moves: 3 }
      ).isMissedMove
    ).toBe(true);
  });

  it('drives the UCI worker through setup, legal PV validation, and termination', async () => {
    const originalWorker = globalThis.Worker;
    const originalWindow = globalThis.window;
    const commands: string[] = [];
    let onMessage: ((event: MessageEvent<unknown>) => void) | undefined;
    let terminated = false;

    const worker = {
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'message') {
          onMessage = listener as (event: MessageEvent<unknown>) => void;
        }
      },
      postMessage: (command: string) => {
        commands.push(command);
        if (command === 'uci') {
          onMessage?.({ data: 'uciok' } as MessageEvent<unknown>);
        } else if (command === 'isready') {
          onMessage?.({ data: 'readyok' } as MessageEvent<unknown>);
        } else if (command.startsWith('go depth')) {
          onMessage?.({
            data: 'info depth 12 score cp 34 nodes 100 pv e2e4 e7e5',
          } as MessageEvent<unknown>);
          onMessage?.({ data: 'bestmove e2e4' } as MessageEvent<unknown>);
        }
      },
      terminate: () => {
        terminated = true;
      },
    };

    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: jest.fn(() => worker),
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { setTimeout, clearTimeout },
    });

    try {
      const result = await analyzeFen(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );
      expect(result).toEqual({
        bestMove: 'e2e4',
        principalVariation: ['e2e4', 'e7e5'],
        depth: 12,
        score: { kind: 'centipawns', value: 34 },
      });
      expect(commands).toContain('setoption name Hash value 16');
      expect(commands).toContain('setoption name Threads value 1');
      expect(commands).toContain(
        'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );
      expect(terminated).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: originalWorker,
      });
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
