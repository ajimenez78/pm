<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Existing frontend

- This is a Next.js App Router application using TypeScript and React. The root route is `src/app/page.tsx`; `src/app/layout.tsx` provides the document metadata and imports the global stylesheet.
- The home page renders `src/features/auth/auth-gate.tsx`, which verifies the
  backend session before showing the Northstar workspace in
  `src/features/workspace.tsx`. The workspace contains the board in
  `src/features/board/`.
- `board.tsx` composes the columns and implements column renaming and drag-and-drop with `@dnd-kit`. `card.tsx` renders draggable cards with a delete action. `add-card-form.tsx` validates and submits new cards. `use-board.ts` owns the current in-memory board state, while `board-data.ts` defines the board/card types and sample board.
- The current board supports five sample columns, column renaming, adding/editing/deleting cards, and pointer/keyboard drag-and-drop. Persistence is not implemented yet; board changes reset on reload.
- Styling is in `src/app/globals.css`, including the existing color variables and responsive board layout. Keep the existing design and accessible labels when changing the board.
- `next.config.ts` uses static export; `npm run build` writes the deployable site to `out/`. The FastAPI backend serves that directory in Docker.
- Unit/component tests use Vitest, Testing Library, and jsdom. Playwright browser tests live in `e2e/`. Use `npm test` and `npm run test:e2e`; also run `npm run lint`, `npm run typecheck`, and `npm run build` for frontend changes.
- Keep board-specific UI and behavior in `src/features/board/` and its related tests. Update the closest unit and browser tests when changing user-visible board behavior.
