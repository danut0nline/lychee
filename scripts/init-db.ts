import { config } from 'dotenv';

config({ path: '.env.local' });

async function main() {
  const { dbConnect } = await import('../lib/db');
  await dbConnect();
  console.log('SQLite/libSQL schema is ready.');
}

main().catch((error) => {
  console.error('Failed to initialize the SQLite/libSQL schema:', error);
  process.exitCode = 1;
});
