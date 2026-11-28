import { randomUUID } from 'node:crypto';
import {
  claimChesscomImportJob,
  detachChesscomGamesOutsideImport,
  getChesscomImportJob,
  type ChesscomGame,
  updateChesscomImportJob,
  upsertChesscomGames,
} from '@/lib/store';

const API_ORIGIN = 'https://api.chess.com';
const USER_AGENT =
  'LycheeChessPuzzles/0.1 (+https://github.com/ahmedmahmud/lychee)';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_GAMES = 100;

type ChesscomArchiveGame = {
  url?: unknown;
  pgn?: unknown;
  end_time?: unknown;
  time_class?: unknown;
  rules?: unknown;
  white?: {
    username?: unknown;
    rating?: unknown;
    result?: unknown;
  };
  black?: {
    username?: unknown;
    rating?: unknown;
    result?: unknown;
  };
};

type EligibleChesscomArchiveGame = ChesscomArchiveGame & {
  url: string;
  pgn: string;
  end_time: number;
  rules: 'chess';
  white: { username: string; rating?: number; result: string };
  black: { username: string; rating?: number; result: string };
};

type ChesscomArchiveResponse = { games?: unknown };
type ChesscomArchivesResponse = { archives?: unknown };
type ArchiveCheckpoint = {
  archiveUrls: string[];
  nextArchive: number;
  fetchedGames: ChesscomArchiveGame[];
  cutoff: number;
  now: number;
};

export type ChesscomImportStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial'
  | 'paused'
  | 'failed';

export type ChesscomImportResult = {
  jobId: string;
  status: ChesscomImportStatus;
  importedGames: number;
  totalGames: number;
  error: string | null;
};

export class ChesscomImportAlreadyRunningError extends Error {
  constructor() {
    super('This Chess.com import is already running.');
    this.name = 'ChesscomImportAlreadyRunningError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArchiveCheckpoint(value: string | null): ArchiveCheckpoint | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !isRecord(parsed) ||
      !Array.isArray(parsed.archiveUrls) ||
      !parsed.archiveUrls.every((url) => typeof url === 'string') ||
      !Number.isInteger(parsed.nextArchive) ||
      !Array.isArray(parsed.fetchedGames) ||
      typeof parsed.cutoff !== 'number' ||
      typeof parsed.now !== 'number'
    ) {
      return null;
    }
    return parsed as ArchiveCheckpoint;
  } catch {
    return null;
  }
}

function archiveMonth(urlText: string, username: string) {
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    return undefined;
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'api.chess.com' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    return undefined;
  }

  const match = url.pathname.match(
    /^\/pub\/player\/([^/]+)\/games\/(\d{4})\/(0[1-9]|1[0-2])$/
  );
  if (!match) return undefined;

  let pathUsername: string;
  try {
    pathUsername = decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
  const year = Number(match[2]);
  if (pathUsername.toLowerCase() !== username.toLowerCase() || year < 1000) {
    return undefined;
  }

  return {
    year,
    month: Number(match[3]),
  };
}

export function selectOverlappingArchives(
  urls: unknown,
  username: string,
  cutoff: number,
  now: number
): string[] {
  if (!Array.isArray(urls)) return [];
  const selected = new Set<string>();
  for (const value of urls) {
    if (typeof value !== 'string') continue;
    const month = archiveMonth(value, username);
    if (!month) continue;
    const monthStart = Date.UTC(month.year, month.month - 1, 1);
    const monthEnd = Date.UTC(month.year, month.month, 1) - 1;
    if (monthStart <= now && monthEnd >= cutoff) {
      selected.add(
        `${API_ORIGIN}/pub/player/${encodeURIComponent(username)}/games/${month.year}/${String(month.month).padStart(2, '0')}`
      );
    }
  }
  return [...selected];
}

function isCompletedStandardGame(
  game: ChesscomArchiveGame,
  username: string,
  cutoff: number,
  now: number
): game is EligibleChesscomArchiveGame {
  if (
    typeof game.url !== 'string' ||
    typeof game.pgn !== 'string' ||
    typeof game.end_time !== 'number' ||
    !Number.isSafeInteger(game.end_time) ||
    game.end_time <= 0 ||
    game.rules !== 'chess' ||
    !isRecord(game.white) ||
    !isRecord(game.black)
  ) {
    return false;
  }

  const playedAt = game.end_time * 1000;
  if (playedAt < cutoff || playedAt > now) return false;

  const whiteName = game.white.username;
  const blackName = game.black.username;
  const whiteResult = game.white.result;
  const blackResult = game.black.result;
  const whiteRating = game.white.rating;
  const blackRating = game.black.rating;
  const hasPlayer =
    (typeof whiteName === 'string' &&
      whiteName.toLowerCase() === username.toLowerCase()) ||
    (typeof blackName === 'string' &&
      blackName.toLowerCase() === username.toLowerCase());
  const finished =
    typeof whiteResult === 'string' &&
    typeof blackResult === 'string' &&
    whiteResult !== '*' &&
    blackResult !== '*' &&
    whiteResult !== 'abandoned' &&
    blackResult !== 'abandoned';

  return (
    hasPlayer &&
    typeof whiteName === 'string' &&
    typeof blackName === 'string' &&
    finished &&
    isChesscomGameUrl(game.url) &&
    game.pgn.trim().length > 0 &&
    (whiteRating === undefined || Number.isInteger(whiteRating)) &&
    (blackRating === undefined || Number.isInteger(blackRating))
  );
}

function isChesscomGameUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'www.chess.com' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      /^\/game\/(live|daily)\/[A-Za-z0-9_-]+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function selectRecentEligibleGames(
  games: ChesscomArchiveGame[],
  username: string,
  cutoff: number,
  now: number
): EligibleChesscomArchiveGame[] {
  const byUrl = new Map<string, EligibleChesscomArchiveGame>();
  for (const game of games) {
    if (isCompletedStandardGame(game, username, cutoff, now)) {
      byUrl.set(game.url, game);
    }
  }
  return [...byUrl.values()]
    .sort((left, right) => right.end_time - left.end_time)
    .slice(0, MAX_GAMES);
}

async function fetchJson(
  url: string,
  fetcher: typeof fetch
): Promise<{ response: Response; data?: unknown }> {
  const response = await fetcher(url, {
    headers: { 'User-Agent': USER_AGENT },
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) return { response };
  try {
    return { response, data: await response.json() };
  } catch {
    return { response, data: undefined };
  }
}

function importStatusForError(
  httpStatus: number,
  importedGames: number
): ChesscomImportStatus {
  if (httpStatus === 429 || httpStatus >= 500) {
    return importedGames > 0 ? 'partial' : 'paused';
  }
  return importedGames > 0 ? 'partial' : 'failed';
}

export async function runChesscomImport(
  userId: string,
  jobId: string,
  fetcher: typeof fetch = fetch,
  now = Date.now()
): Promise<ChesscomImportResult> {
  const job = await getChesscomImportJob(userId, jobId);
  if (!job) throw new Error('Chess.com import job not found.');
  if (job.status === 'completed') {
    throw new Error('This Chess.com import has already completed.');
  }
  if (!(await claimChesscomImportJob(userId, jobId))) {
    throw new ChesscomImportAlreadyRunningError();
  }

  let checkpoint = asArchiveCheckpoint(job.checkpoint);
  if (
    checkpoint &&
    (checkpoint.nextArchive < 0 ||
      checkpoint.nextArchive > checkpoint.archiveUrls.length ||
      checkpoint.archiveUrls.some(
        (url) =>
          !selectOverlappingArchives(
            [url],
            job.sourceUsername,
            checkpoint!.cutoff,
            checkpoint!.now
          ).includes(url)
      ))
  ) {
    checkpoint = null;
  }
  let archiveUrls: string[];
  let nextArchive: number;
  let fetchedGames: ChesscomArchiveGame[];
  let effectiveCutoff: number;
  let effectiveNow: number;

  if (checkpoint) {
    ({ archiveUrls, nextArchive, fetchedGames } = checkpoint);
    effectiveCutoff = checkpoint.cutoff;
    effectiveNow = checkpoint.now;
  } else {
    const archivesUrl = `${API_ORIGIN}/pub/player/${encodeURIComponent(
      job.sourceUsername
    )}/games/archives`;
    let archiveResponse: { response: Response; data?: unknown };
    try {
      archiveResponse = await fetchJson(archivesUrl, fetcher);
    } catch {
      await updateChesscomImportJob(userId, jobId, {
        checkpoint: null,
        updatedAt: Date.now(),
      });
      return await finishImportJob(
        userId,
        jobId,
        'paused',
        0,
        0,
        'Chess.com could not be reached. Resume this import when the service is available.'
      );
    }

    if (archiveResponse.response.status === 404) {
      return await finishImportJob(
        userId,
        jobId,
        'failed',
        0,
        0,
        'Chess.com did not find the configured public account.'
      );
    }
    if (
      !archiveResponse.response.ok ||
      !isRecord(archiveResponse.data) ||
      !Array.isArray(archiveResponse.data.archives) ||
      !archiveResponse.data.archives.every((url) => typeof url === 'string')
    ) {
      const status = importStatusForError(archiveResponse.response.status, 0);
      return await finishImportJob(
        userId,
        jobId,
        status,
        0,
        0,
        `Chess.com archive discovery failed (HTTP ${archiveResponse.response.status}).`
      );
    }

    const payload = archiveResponse.data as ChesscomArchivesResponse;
    const archiveUrlsFromResponse = payload.archives as string[];
    const start = job.windowStart || now - THIRTY_DAYS_MS;
    const end = job.windowEnd || now;
    archiveUrls = selectOverlappingArchives(
      archiveUrlsFromResponse,
      job.sourceUsername,
      start,
      end
    );
    if (
      archiveUrlsFromResponse.length > 0 &&
      archiveUrls.length === 0 &&
      archiveUrlsFromResponse.every(
        (url) => !archiveMonth(url, job.sourceUsername)
      )
    ) {
      return await finishImportJob(
        userId,
        jobId,
        'failed',
        0,
        0,
        'Chess.com returned an invalid archive URL list.'
      );
    }
    nextArchive = 0;
    fetchedGames = [];
    effectiveCutoff = start;
    effectiveNow = end;
  }

  for (; nextArchive < archiveUrls.length; nextArchive += 1) {
    let archiveResponse: { response: Response; data?: unknown };
    try {
      archiveResponse = await fetchJson(archiveUrls[nextArchive], fetcher);
    } catch {
      const status = nextArchive > 0 ? 'partial' : 'paused';
      await saveImportCheckpoint(
        userId,
        jobId,
        archiveUrls,
        nextArchive,
        fetchedGames,
        effectiveCutoff,
        effectiveNow
      );
      const selectedGames = selectRecentEligibleGames(
        fetchedGames,
        job.sourceUsername,
        effectiveCutoff,
        effectiveNow
      );
      await persistSelectedGames(
        userId,
        jobId,
        job.sourceUsername,
        selectedGames
      );
      return await finishImportJob(
        userId,
        jobId,
        status,
        selectedGames.length,
        selectedGames.length,
        'A monthly archive could not be reached. Resume this import to continue.'
      );
    }

    if (!archiveResponse.response.ok || !isRecord(archiveResponse.data)) {
      const status = importStatusForError(
        archiveResponse.response.status,
        fetchedGames.length
      );
      await saveImportCheckpoint(
        userId,
        jobId,
        archiveUrls,
        nextArchive,
        fetchedGames,
        effectiveCutoff,
        effectiveNow
      );
      const selectedGames = selectRecentEligibleGames(
        fetchedGames,
        job.sourceUsername,
        effectiveCutoff,
        effectiveNow
      );
      await persistSelectedGames(
        userId,
        jobId,
        job.sourceUsername,
        selectedGames
      );
      return await finishImportJob(
        userId,
        jobId,
        status,
        selectedGames.length,
        selectedGames.length,
        `A Chess.com monthly archive failed (HTTP ${archiveResponse.response.status}).`
      );
    }

    const games = (archiveResponse.data as ChesscomArchiveResponse).games;
    if (!Array.isArray(games)) {
      const status = nextArchive > 0 ? 'partial' : 'failed';
      await saveImportCheckpoint(
        userId,
        jobId,
        archiveUrls,
        nextArchive,
        fetchedGames,
        effectiveCutoff,
        effectiveNow
      );
      await persistSelectedGames(
        userId,
        jobId,
        job.sourceUsername,
        fetchedGames
      );
      return await finishImportJob(
        userId,
        jobId,
        status,
        fetchedGames.length,
        fetchedGames.length,
        'Chess.com returned an invalid monthly archive response.'
      );
    }
    fetchedGames = selectRecentEligibleGames(
      [...fetchedGames, ...(games.filter(isRecord) as ChesscomArchiveGame[])],
      job.sourceUsername,
      effectiveCutoff,
      effectiveNow
    );
    await saveImportCheckpoint(
      userId,
      jobId,
      archiveUrls,
      nextArchive + 1,
      fetchedGames,
      effectiveCutoff,
      effectiveNow
    );
    await persistSelectedGames(userId, jobId, job.sourceUsername, fetchedGames);
    await updateChesscomImportJob(userId, jobId, {
      totalGames: fetchedGames.length,
      importedGames: fetchedGames.length,
      updatedAt: Date.now(),
    });
  }

  const selectedGames = selectRecentEligibleGames(
    fetchedGames,
    job.sourceUsername,
    effectiveCutoff,
    effectiveNow
  );
  await persistSelectedGames(userId, jobId, job.sourceUsername, selectedGames);

  return await finishImportJob(
    userId,
    jobId,
    'completed',
    selectedGames.length,
    selectedGames.length,
    null
  );
}

async function saveImportCheckpoint(
  userId: string,
  jobId: string,
  archiveUrls: string[],
  nextArchive: number,
  fetchedGames: ChesscomArchiveGame[],
  cutoff: number,
  now: number
) {
  await updateChesscomImportJob(userId, jobId, {
    checkpoint: JSON.stringify({
      archiveUrls,
      nextArchive,
      fetchedGames,
      cutoff,
      now,
    } satisfies ArchiveCheckpoint),
    updatedAt: Date.now(),
  });
}

async function persistSelectedGames(
  userId: string,
  jobId: string,
  username: string,
  selectedGames: ChesscomArchiveGame[]
) {
  const sourceUrls: string[] = [];
  const gameRecords: ChesscomGame[] = [];
  for (const game of selectedGames) {
    if (
      typeof game.url !== 'string' ||
      typeof game.pgn !== 'string' ||
      typeof game.end_time !== 'number' ||
      typeof game.white?.username !== 'string' ||
      typeof game.black?.username !== 'string'
    ) {
      continue;
    }
    sourceUrls.push(game.url);
    const userIsWhite =
      game.white.username.toLowerCase() === username.toLowerCase();
    gameRecords.push({
      id: randomUUID(),
      userId,
      sourceUsername: username,
      sourceUrl: game.url,
      playedAt: game.end_time * 1000,
      whiteUsername: game.white.username,
      blackUsername: game.black.username,
      whiteRating: Number.isInteger(game.white.rating)
        ? (game.white.rating as number)
        : null,
      blackRating: Number.isInteger(game.black.rating)
        ? (game.black.rating as number)
        : null,
      timeClass: typeof game.time_class === 'string' ? game.time_class : null,
      rules: 'chess',
      result: userIsWhite
        ? (game.white.result as string)
        : (game.black.result as string),
      pgn: game.pgn,
      createdAt: Date.now(),
    });
  }
  await upsertChesscomGames(userId, jobId, gameRecords);
  await detachChesscomGamesOutsideImport(userId, jobId, sourceUrls);
}

async function finishImportJob(
  userId: string,
  jobId: string,
  status: ChesscomImportStatus,
  importedGames: number,
  totalGames: number,
  error: string | null
): Promise<ChesscomImportResult> {
  await updateChesscomImportJob(userId, jobId, {
    status,
    importedGames,
    totalGames,
    checkpoint:
      status === 'completed' || status === 'failed' ? null : undefined,
    error,
    updatedAt: Date.now(),
  });
  return { jobId, status, importedGames, totalGames, error };
}

export function createImportWindow(now = Date.now()) {
  return { windowStart: now - THIRTY_DAYS_MS, windowEnd: now };
}
