# Agent guidance

- Read [docs/technical-specification.md](docs/technical-specification.md) before changing application flow, persistence, or puzzle selection.
- This is a single Next.js 14 app, not a workspace. App Router pages and handlers live in `app/`; shared UI is in `components/`; MongoDB models are in `models/`; rating, similarity, and review algorithms are in `src/`.
- Install with `npm install`; run locally with `npm run dev` (port 3000). Set `MONGODB_URI` to a MongoDB database that includes the `testPuzzles` corpus. Lichess sign-in also needs `LICHESS_CLIENT_ID`; production OAuth callback URLs use `NEXT_PUBLIC_BASE_URL`.
- **Do not copy the value in `.env.template`: it contains a committed MongoDB credential. Use your own connection string and rotate the exposed credential.** `.env.local` is git-ignored.
- The root layout redirects every request when `REDIRECT` is set. Leave it unset for ordinary local development.
- Run all unit tests with `npm test`; run one test file with `npm test -- test/sm2.test.ts` (replace the path as needed). Tests are under `test/` and use Jest/ts-jest.
- Run formatting validation with `npm run format`; `npm run format:fix` rewrites files. Other checks are `npm run lint`, `npx tsc --noEmit`, and `npm run build`. CI currently runs only formatting and Jest.
- Preserve the `@/*` TypeScript alias (root-relative) and Prettier's single-quote settings when adding imports or formatting code.
