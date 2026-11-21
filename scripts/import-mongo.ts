import { createHash } from 'node:crypto';
import { config } from 'dotenv';
import { MongoClient, type Db, type Document } from 'mongodb';

config({ path: '.env.local' });

type SqlStatement = { sql: string; args: Array<string | number | null> };
let writeBatch: (statements: SqlStatement[]) => Promise<unknown>;

const sourceUrl = process.env.SOURCE_MONGODB_URI;
const sourceDatabase = process.env.SOURCE_MONGODB_DATABASE;

if (!sourceUrl || !sourceDatabase) {
  throw new Error(
    'Set SOURCE_MONGODB_URI and SOURCE_MONGODB_DATABASE before importing.'
  );
}

const stringify = (value: unknown): string => JSON.stringify(value ?? []);
const asString = (value: unknown): string => String(value ?? '');
const asNumber = (value: unknown): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};
const asTimestamp = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (value) {
    const timestamp = new Date(String(value)).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return Date.now();
};
const sessionHash = (id: string): string =>
  createHash('sha256').update(id).digest('hex');
const parseJsonString = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

class ImportWriter {
  private statements: SqlStatement[] = [];
  private imported = 0;

  async add(statement: SqlStatement): Promise<void> {
    this.statements.push(statement);
    this.imported += 1;
    if (this.statements.length >= 400) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.statements.length === 0) return;
    await writeBatch(this.statements);
    this.statements = [];
  }

  count(): number {
    return this.imported;
  }
}

async function importCollection(
  source: Db,
  collectionName: string,
  map: (document: Document, writer: ImportWriter) => Promise<void>
): Promise<number> {
  const writer = new ImportWriter();
  const cursor = source.collection(collectionName).find({});
  try {
    for await (const document of cursor) {
      await map(document, writer);
    }
    await writer.flush();
  } finally {
    await cursor.close();
  }
  console.log(`${collectionName}: ${writer.count()} records imported`);
  return writer.count();
}

async function main() {
  const { client, dbConnect } = await import('../lib/db');
  writeBatch = (statements) => client.batch(statements, 'write');
  await dbConnect();

  const mongo = new MongoClient(sourceUrl!);
  await mongo.connect();
  const source = mongo.db(sourceDatabase!);
  const puzzleCountInSource = await source
    .collection('testPuzzles')
    .countDocuments();
  if (puzzleCountInSource === 0) {
    await mongo.close();
    throw new Error('The source testPuzzles collection is empty or missing.');
  }

  const existing = await client.execute(
    `SELECT
      (SELECT count(*) FROM users) +
      (SELECT count(*) FROM puzzles) +
      (SELECT count(*) FROM auth_sessions) +
      (SELECT count(*) FROM ratings) +
      (SELECT count(*) FROM initial_ratings) +
      (SELECT count(*) FROM solved_puzzles) +
      (SELECT count(*) FROM rating_history) +
      (SELECT count(*) FROM user_theme_ratings) +
      (SELECT count(*) FROM theme_times) +
      (SELECT count(*) FROM active_puzzles) +
      (SELECT count(*) FROM leitner_reviews) +
      (SELECT count(*) FROM recent_groups) +
      (SELECT count(*) FROM last_batches) +
      (SELECT count(*) FROM similarity_caches) AS count`
  );
  if (
    Number(existing.rows[0]?.count ?? 0) > 0 &&
    !process.argv.includes('--resume')
  ) {
    await mongo.close();
    throw new Error(
      'The destination is not empty. Use a new database, or pass --resume only to continue a previously interrupted import before the app has been used.'
    );
  }

  try {
    await importCollection(source, 'users', async (doc, writer) => {
      const id = asString(doc._id);
      const username = asString(doc.username);
      if (!id || !username) return;
      await writer.add({
        sql: 'INSERT OR REPLACE INTO users (id, username) VALUES (?, ?)',
        args: [id, username],
      });
    });

    await importCollection(source, 'sessions', async (doc, writer) => {
      const id = asString(doc._id);
      const userId = asString(doc.user_id);
      if (!id || !userId) return;
      await writer.add({
        sql: 'INSERT OR REPLACE INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
        args: [sessionHash(id), userId, asTimestamp(doc.expires_at)],
      });
    });

    await importCollection(source, 'ratings', async (doc, writer) => {
      await writer.add({
        sql: 'INSERT OR REPLACE INTO ratings (username, rating, rating_deviation, volatility, number_of_results) VALUES (?, ?, ?, ?, ?)',
        args: [
          asString(doc.username),
          asNumber(doc.rating),
          asNumber(doc.ratingDeviation),
          asNumber(doc.volatility),
          asNumber(doc.numberOfResults),
        ],
      });
    });

    await importCollection(source, 'initratings', async (doc, writer) => {
      await writer.add({
        sql: 'INSERT OR REPLACE INTO initial_ratings (username, rating) VALUES (?, ?)',
        args: [asString(doc.username), asNumber(doc.rating)],
      });
    });

    await importCollection(source, 'allrounds', async (doc, writer) => {
      const username = asString(doc.username);
      const solved = Array.isArray(doc.solved) ? doc.solved.map(asString) : [];
      for (let position = 0; position < solved.length; position += 1) {
        await writer.add({
          sql: 'INSERT OR REPLACE INTO solved_puzzles (username, puzzle_id, position) VALUES (?, ?, ?)',
          args: [username, solved[position], position],
        });
      }
    });

    await importCollection(source, 'ratinghistories', async (doc, writer) => {
      await writer.add({
        sql: 'INSERT OR REPLACE INTO rating_history (source_id, username, theme, rating, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [
          asString(doc._id),
          asString(doc.username),
          asString(doc.theme),
          asNumber(doc.rating),
          asTimestamp(doc.createdAt),
        ],
      });
    });

    await importCollection(source, 'userthemeratings', async (doc, writer) => {
      await writer.add({
        sql: 'INSERT OR REPLACE INTO user_theme_ratings (username, theme, rating, rating_deviation, volatility, number_of_results) VALUES (?, ?, ?, ?, ?, ?)',
        args: [
          asString(doc.username),
          asString(doc.theme),
          asNumber(doc.rating),
          asNumber(doc.ratingDeviation),
          asNumber(doc.volatility),
          asNumber(doc.numberOfResults),
        ],
      });
    });

    await importCollection(source, 'timethemes', async (doc, writer) => {
      await writer.add({
        sql: 'INSERT OR REPLACE INTO theme_times (username, theme, time) VALUES (?, ?, ?)',
        args: [asString(doc.username), asString(doc.theme), asNumber(doc.time)],
      });
    });

    await importCollection(source, 'activepuzzles', async (doc, writer) => {
      await writer.add({
        sql: 'INSERT OR REPLACE INTO active_puzzles (username, puzzle, reviewee, group_id) VALUES (?, ?, ?, ?)',
        args: [
          asString(doc.username),
          stringify(parseJsonString(doc.puzzle)),
          doc.reviewee ? stringify(parseJsonString(doc.reviewee)) : null,
          asString(doc.groupID ?? ''),
        ],
      });
    });

    await importCollection(source, 'themedleitners', async (doc, writer) => {
      await writer.add({
        sql: 'INSERT OR REPLACE INTO leitner_reviews (username, group_id, box_a, box_b) VALUES (?, ?, ?, ?)',
        args: [
          asString(doc.username),
          asString(doc.groupID),
          stringify(doc.boxA),
          stringify(doc.boxB),
        ],
      });
    });

    await importCollection(source, 'recentgroups', async (doc, writer) => {
      await writer.add({
        sql: 'INSERT OR REPLACE INTO recent_groups (username, group_id, last_used) VALUES (?, ?, ?)',
        args: [
          asString(doc.username),
          asString(doc.groupId),
          asTimestamp(doc.lastUsed),
        ],
      });
    });

    await importCollection(source, 'lastbatches', async (doc, writer) => {
      await writer.add({
        sql: 'INSERT OR REPLACE INTO last_batches (username, batch) VALUES (?, ?)',
        args: [asString(doc.username), stringify(doc.batch)],
      });
    });

    await importCollection(source, 'similarities', async (doc, writer) => {
      await writer.add({
        sql: 'INSERT OR REPLACE INTO similarity_caches (puzzle_id, cache) VALUES (?, ?)',
        args: [asString(doc.puzzleId), stringify(doc.cache)],
      });
    });

    let puzzleCount = 0;
    const puzzleWriter = new ImportWriter();
    const puzzleCursor = source.collection('testPuzzles').find({});
    try {
      for await (const doc of puzzleCursor) {
        const puzzle = {
          PuzzleId: asString(doc.PuzzleId),
          FEN: asString(doc.FEN),
          Moves: asString(doc.Moves),
          Rating: asNumber(doc.Rating),
          RatingDeviation: asNumber(doc.RatingDeviation),
          Popularity: asNumber(doc.Popularity),
          NbPlays: asNumber(doc.NbPlays),
          Themes: asString(doc.Themes),
          GameUrl: asString(doc.GameUrl),
          hierarchy_tags: asString(doc.hierarchy_tags),
        };
        const puzzleId = puzzle.PuzzleId;
        if (!puzzleId) continue;

        await puzzleWriter.add({
          sql: 'INSERT OR REPLACE INTO puzzles (puzzle_id, fen, moves, rating, rating_deviation, popularity, number_of_plays, themes, game_url, hierarchy_tags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [
            puzzleId,
            puzzle.FEN,
            puzzle.Moves,
            puzzle.Rating,
            puzzle.RatingDeviation,
            puzzle.Popularity,
            puzzle.NbPlays,
            puzzle.Themes,
            puzzle.GameUrl,
            puzzle.hierarchy_tags,
            JSON.stringify(puzzle),
          ],
        });
        for (const theme of new Set(
          puzzle.Themes.split(/\s+/).filter(Boolean)
        )) {
          await puzzleWriter.add({
            sql: 'INSERT OR REPLACE INTO puzzle_themes (puzzle_id, theme) VALUES (?, ?)',
            args: [puzzleId, theme.toLowerCase()],
          });
        }
        puzzleCount += 1;
        if (puzzleCount % 10000 === 0) {
          console.log(`Puzzle corpus: ${puzzleCount} puzzles imported`);
        }
      }
      await puzzleWriter.flush();
    } finally {
      await puzzleCursor.close();
    }
    console.log(`testPuzzles: ${puzzleCount} puzzles imported`);
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error('MongoDB import failed:', error);
  process.exitCode = 1;
});
