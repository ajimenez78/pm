<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Existing frontend

- This is a Next.js App Router application using TypeScript and React. The root route is `src/app/page.tsx`; `src/app/layout.tsx` provides the document metadata and imports the global stylesheet.
- The home page renders `src/features/auth/auth-gate.tsx`, which verifies the
  backend session and offers sign-in or account creation before showing the
  workspace in `src/features/workspace.tsx`. The workspace holds the board
  switcher, the new-board form, and the account settings view
  (`auth/account-settings.tsx`).
- `src/lib/api.ts` holds the shared fetch helpers and `ApiError`. Auth calls are
  in `auth/auth-api.ts`; board calls are in `board/board-api.ts`.
- `board/use-boards.ts` loads the user's boards and remembers the selection in
  `localStorage`. `board/use-board.ts` loads one board and reloads it after each
  mutation. The workspace remounts `<Board key={boardId}>` when switching.
- `board.tsx` renders the board header (edit details, delete), the search and
  priority filter toolbar, the columns, and `@dnd-kit` drag and drop. `card.tsx`
  renders cards; `card-meta.tsx` holds the priority/due-date badges and form
  fields. `chat-panel.tsx` is the AI sidebar.
- Styling is in `src/app/globals.css`, including the existing color variables and responsive board layout. Content uses the full viewport width; the sidebar collapses to an icon rail at 1280px and below, and above 1100px the AI chat docks as a column beside the board (it overlays the board on narrower screens). Card actions are always-visible icon buttons with accessible labels. Keep the existing design and accessible labels when changing the board.
- `next.config.ts` uses static export; `npm run build` writes the deployable site to `out/`. The FastAPI backend serves that directory in Docker.
- Unit/component tests use Vitest, Testing Library, and jsdom. `src/test/fake-api.ts` is an in-memory stand-in for the backend installed as `fetch`; prefer it over order-dependent fetch mocks.
- Playwright tests in `e2e/` build the export and run against the real FastAPI backend with a temporary database (or `PLAYWRIGHT_BASE_URL`). Each test registers its own account and deletes it afterwards; only the AI chat endpoint is stubbed. Use `npm test` and `npm run test:e2e`; also run `npm run lint`, `npm run typecheck`, and `npm run build` for frontend changes.
- Keep board-specific UI and behavior in `src/features/board/` and its related tests. Update the closest unit and browser tests when changing user-visible board behavior.
