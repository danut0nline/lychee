import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { config } from 'dotenv';
import { parse } from 'csv-parse';

config({ path: '.env.local' });

type CsvRow = Record<string, string | undefined>;
type SqlStatement = { sql: string; args: Array<string | number | null> };

let writeBatch: (statements: SqlStatement[]) => Promise<unknown>;

class ImportWriter {
  private statements: SqlStatement[] = [];

  async add(statement: SqlStatement): Promise<void> {
    this.statements.push(statement);
    if (this.statements.length >= 400) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.statements.length === 0) return;
    await writeBatch(this.statements);
    this.statements = [];
  }
}

const numberField = (row: CsvRow, field: string, fallback = 0): number => {
  const value = Number(row[field]);
  return Number.isFinite(value) ? value : fallback;
};

const getImportOptions = () => {
  const args = process.argv.slice(2);
  const positionalArgs = args.filter(
    (arg, index) => !arg.startsWith('--') && args[index - 1] !== '--limit'
  );
  const csvPath = process.env.LICHESS_PUZZLES_CSV ?? positionalArgs[0];
  const limitIndex = args.indexOf('--limit');
  const limitValue = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 25_000;
  const importAll = args.includes('--all');
  const resume = args.includes('--resume');

  if (!csvPath) {
    throw new Error(
      'Set LICHESS_PUZZLES_CSV in .env.local or pass a decompressed .csv path to the command.'
    );
  }
  if (!importAll && (!Number.isInteger(limitValue) || limitValue < 1)) {
    throw new Error('The --limit value must be a positive integer.');
  }
  if (csvPath.endsWith('.zst')) {
    throw new Error(
      'The puzzle CSV must be decompressed first. Extract the .zst file to a .csv file and pass that path.'
    );
  }

  return {
    csvPath,
    limit: importAll ? Number.POSITIVE_INFINITY : limitValue,
    resume,
  };
};

async function main() {
  const options = getImportOptions();
  await access(options.csvPath);

  const { client, dbConnect } = await import('../lib/db');
  writeBatch = (statements) => client.batch(statements, 'write');
  await dbConnect();

  const existing = await client.execute(
    'SELECT count(*) AS count FROM puzzles'
  );
  if (Number(existing.rows[0]?.count ?? 0) > 0 && !options.resume) {
    throw new Error(
      'The destination already contains puzzles. Use --resume only to continue an interrupted import before using the app.'
    );
  }

  const parser = createReadStream(options.csvPath).pipe(
    parse({ bom: true, columns: true, skip_empty_lines: true })
  );
  const writer = new ImportWriter();
  let imported = 0;

  try {
    for await (const rawRow of parser) {
      if (imported >= options.limit) break;

      const row = rawRow as CsvRow;
      const puzzleId = row.PuzzleId?.trim();
      const fen = row.FEN?.trim();
      const moves = row.Moves?.trim();
      const themes = [
        ...new Set((row.Themes ?? '').split(/\s+/).filter(Boolean)),
      ];
      if (!puzzleId || !fen || !moves || themes.length === 0) continue;

      const puzzle = {
        PuzzleId: puzzleId,
        FEN: fen,
        Moves: moves,
        Rating: numberField(row, 'Rating', 1500),
        RatingDeviation: numberField(row, 'RatingDeviation', 350),
        Popularity: numberField(row, 'Popularity'),
        NbPlays: numberField(row, 'NbPlays'),
        Themes: themes.join(' '),
        GameUrl: row.GameUrl?.trim() ?? '',
        // The official CSV has no hierarchy_tags column; use the theme set as
        // a flat similarity signature when importing that source.
        hierarchy_tags: row.hierarchy_tags?.trim() || themes.join(' '),
      };

      await writer.add({
        sql: 'INSERT OR REPLACE INTO puzzles (puzzle_id, fen, moves, rating, rating_deviation, popularity, number_of_plays, themes, game_url, hierarchy_tags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [
          puzzle.PuzzleId,
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
      for (const theme of themes) {
        await writer.add({
          sql: 'INSERT OR REPLACE INTO puzzle_themes (puzzle_id, theme) VALUES (?, ?)',
          args: [puzzleId, theme.toLowerCase()],
        });
      }

      imported += 1;
      if (imported % 10_000 === 0) {
        console.log(`Imported ${imported} puzzles`);
      }
    }

    await writer.flush();
  } finally {
    parser.destroy();
  }

  if (imported === 0) {
    throw new Error('No valid puzzles were found in the CSV.');
  }
  console.log(`Imported ${imported} puzzles from ${options.csvPath}`);
}

main().catch((error) => {
  console.error('Lichess CSV import failed:', error);
  process.exitCode = 1;
});
