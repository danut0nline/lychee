# Lychee\_

An app to improve your chess skills through personalized puzzles  
https://lychee-omega.vercel.app

<!-- ![Project Logo or Screenshot](images/logo.png) -->

<!-- One-paragraph project overview. Explain what the project does, its main features, and its purpose. -->

<!-- ## Table of Contents

- [Demo](#demo)
- [Installation](#installation)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments) -->

## Installation

Install packages

```bash
# Clone the repository
git clone https://github.com/ahmedmahmud/lychee.git

# Change directory
cd lychee

# Install dependencies
npm install
```

Set up environment

```bash
cp .env.template .env.local
```

For local development, `TURSO_DATABASE_URL=file:./lychee.db` uses a local SQLite database. Set `LICHESS_CLIENT_ID` to enable sign-in. Initialize the schema with `npm run db:init` (the app also initializes it on first request). For Vercel, configure `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for a remote Turso database; a local SQLite file is not persistent across serverless deployments.

The local database starts empty. Download the puzzle CSV from the [Lichess open database](https://database.lichess.org/#puzzles), decompress the `.zst` file to `.csv`, then import a starter corpus:

```bash
npm run db:import-lichess -- ./lichess_db_puzzle.csv --limit 25000
```

Use `--all` instead of `--limit 25000` to import the entire dataset. The official CSV lacks Lychee's custom `hierarchy_tags`, so the importer uses each puzzle's themes as a flat similarity signature.

To migrate existing user data and the puzzle corpus from MongoDB instead, set `SOURCE_MONGODB_URI`, `SOURCE_MONGODB_DATABASE`, and the destination Turso variables, then run `npm run db:import-mongo` against a new, empty database. If an import is interrupted, rerun with `npm run db:import-mongo -- --resume` before using the destination app. See [the technical specification](docs/technical-specification.md) for details.

Run the server

```
npm run dev
```

Open it at

```
localhost:3000
```
