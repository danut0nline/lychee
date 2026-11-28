import * as store from '@/lib/store';
import {
  ChesscomImportAlreadyRunningError,
  runChesscomImport,
  type ChesscomImportStatus,
} from '@/src/chesscom/import';

const now = Date.UTC(2025, 2, 1, 12);
const windowStart = now - 30 * 24 * 60 * 60 * 1000;

describe('Chess.com import job execution', () => {
  let job: Record<string, unknown>;
  let savedGames: Array<Record<string, unknown>>;
  let activeRun: boolean;

  beforeEach(() => {
    job = {
      id: 'job-1',
      userId: 'user-1',
      sourceUsername: 'player',
      status: 'queued' as ChesscomImportStatus,
      windowStart,
      windowEnd: now,
      totalGames: 0,
      importedGames: 0,
      checkpoint: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    savedGames = [];
    activeRun = false;

    jest.spyOn(store, 'getChesscomImportJob').mockImplementation(async () => {
      return { ...job } as Awaited<
        ReturnType<typeof store.getChesscomImportJob>
      >;
    });
    jest.spyOn(store, 'claimChesscomImportJob').mockImplementation(async () => {
      if (activeRun) return false;
      activeRun = true;
      job.status = 'running';
      return true;
    });
    jest
      .spyOn(store, 'updateChesscomImportJob')
      .mockImplementation(async (_userId, _jobId, update) => {
        Object.assign(
          job,
          Object.fromEntries(
            Object.entries(update).filter(([, value]) => value !== undefined)
          )
        );
        if (update.status && update.status !== 'running') activeRun = false;
      });
    jest
      .spyOn(store, 'upsertChesscomGames')
      .mockImplementation(async (_userId, _jobId, games) => {
        games.forEach((game) => {
          const existing = savedGames.find(
            (stored) => stored.sourceUrl === game.sourceUrl
          );
          if (existing) Object.assign(existing, game, { id: existing.id });
          else savedGames.push({ ...game });
        });
      });
    jest
      .spyOn(store, 'detachChesscomGamesOutsideImport')
      .mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('imports serially, pauses on rate limiting, then resumes idempotently', async () => {
    const archiveBase = 'https://api.chess.com/pub/player/player/games';
    const urls = [
      `${archiveBase}/2025/01`,
      `${archiveBase}/2025/02`,
      `${archiveBase}/2025/03`,
    ];
    const requests: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const firstRun = async (input: RequestInfo | URL) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const url = String(input);
      requests.push(url);
      const response = url.endsWith('/archives')
        ? jsonResponse({ archives: urls })
        : url === urls[0]
          ? jsonResponse({ games: [game('1', windowStart + 10_000)] })
          : new Response('rate limited', { status: 429 });
      inFlight -= 1;
      return response;
    };

    const partial = await runChesscomImport(
      'user-1',
      'job-1',
      firstRun as typeof fetch,
      now
    );
    expect(partial.status).toBe('partial');
    expect(partial.importedGames).toBe(1);
    expect(JSON.parse(job.checkpoint as string)).toMatchObject({
      nextArchive: 1,
    });
    expect(savedGames).toHaveLength(1);
    expect(maxInFlight).toBe(1);

    const resumeRequests: string[] = [];
    const resumed = await runChesscomImport(
      'user-1',
      'job-1',
      (async (input: RequestInfo | URL) => {
        const url = String(input);
        resumeRequests.push(url);
        if (url === urls[1]) {
          return jsonResponse({ games: [game('2', windowStart + 20_000)] });
        }
        return jsonResponse({ games: [game('3', windowStart + 30_000)] });
      }) as typeof fetch,
      now
    );

    expect(resumed.status).toBe('completed');
    expect(resumed.importedGames).toBe(3);
    expect(savedGames).toHaveLength(3);
    expect(resumeRequests).toEqual(urls.slice(1));
    expect(requests).toEqual([`${archiveBase}/archives`, urls[0], urls[1]]);
  });

  it('does not advance a job when a monthly HTTP 200 payload is malformed', async () => {
    const archive1 = 'https://api.chess.com/pub/player/player/games/2025/01';
    const archive2 = 'https://api.chess.com/pub/player/player/games/2025/02';
    const result = await runChesscomImport(
      'user-1',
      'job-1',
      (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/archives')) {
          return jsonResponse({ archives: [archive1, archive2] });
        }
        return url === archive1
          ? jsonResponse({ games: [game('1', windowStart + 10_000)] })
          : jsonResponse({});
      }) as typeof fetch,
      now
    );

    expect(result.status).toBe('partial');
    expect(JSON.parse(job.checkpoint as string)).toMatchObject({
      nextArchive: 1,
    });
    expect(savedGames).toHaveLength(1);
  });

  it('prevents overlapping resumes from regressing the job checkpoint', async () => {
    let notifyArchiveRequest = () => {};
    let resolveArchiveResponse: (response: Response) => void = () => {};
    const archiveResponse = new Promise<Response>((resolve) => {
      resolveArchiveResponse = resolve;
    });
    const requestStarted = new Promise<void>((resolve) => {
      notifyArchiveRequest = resolve;
    });
    const fetcher = (async () => {
      notifyArchiveRequest();
      return archiveResponse;
    }) as typeof fetch;

    const firstRun = runChesscomImport('user-1', 'job-1', fetcher, now);
    await requestStarted;
    await expect(
      runChesscomImport('user-1', 'job-1', fetcher, now)
    ).rejects.toBeInstanceOf(ChesscomImportAlreadyRunningError);

    resolveArchiveResponse(jsonResponse({ archives: [] }));
    const result = await firstRun;
    expect(result.status).toBe('completed');
    expect(job.status).toBe('completed');
  });
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function game(id: string, playedAt: number) {
  return {
    url: `https://www.chess.com/game/live/${id}`,
    pgn: `[Event "Fixture"]
[White "player"]
[Black "opponent"]

1. e4 e5 1-0`,
    end_time: Math.floor(playedAt / 1000),
    time_class: 'rapid',
    rules: 'chess',
    white: { username: 'player', rating: 1500, result: 'win' },
    black: { username: 'opponent', rating: 1500, result: 'checkmated' },
  };
}
