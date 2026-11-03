import { vi } from "vitest";
import type {
  BoardCard,
  BoardData,
  CardFields,
} from "@/features/board/board-data";

/**
 * An in-memory stand-in for the FastAPI backend, installed as `fetch`.
 * It follows the same routes and status codes so component tests can
 * exercise whole flows without depending on call order.
 */

const COLUMNS = [
  ["backlog", "Backlog"],
  ["up-next", "Up next"],
  ["in-progress", "In progress"],
  ["in-review", "In review"],
  ["done", "Done"],
] as const;

type Account = { password: string; boards: BoardData[] };

export function makeCard(
  columnId: string,
  title: string,
  overrides: Partial<BoardCard> = {},
): BoardCard {
  return {
    id: `card-${title.toLowerCase().replace(/\W+/g, "-")}`,
    column_id: columnId,
    title,
    details: "",
    priority: "none",
    due_date: null,
    position: 0,
    ...overrides,
  };
}

export function makeBoard(
  id: string,
  title: string,
  cards: BoardCard[] = [],
): BoardData {
  return {
    id,
    title,
    description: "",
    columns: COLUMNS.map(([columnId, columnTitle], position) => ({
      id: columnId,
      title: columnTitle,
      position,
      cards: cards
        .filter((card) => card.column_id === columnId)
        .map((card, index) => ({ ...card, position: index })),
    })),
  };
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function notFound(): Response {
  return json({ detail: "Not found" }, 404);
}

export class FakeApi {
  accounts = new Map<string, Account>();
  session: string | null = null;
  chatReply: ((board: BoardData, question: string) => {
    reply: string;
    board: BoardData;
  }) | null = null;
  failures = new Map<string, Response>();
  requests: { method: string; path: string; body: unknown }[] = [];
  private nextId = 1;

  constructor() {
    this.accounts.set("user", {
      password: "password",
      boards: [
        makeBoard("board-1", "Product launch", [
          makeCard("backlog", "Review brand direction", {
            details: "Align the visual identity.",
          }),
          makeCard("backlog", "Plan customer interviews", {
            priority: "high",
          }),
          makeCard("done", "Finalize launch brief"),
        ]),
      ],
    });
  }

  signIn(username = "user") {
    this.session = username;
    return this;
  }

  /** Make the next request matching "METHOD /path" return this response. */
  failNext(route: string, status: number, detail = "Request failed") {
    this.failures.set(route, json({ detail }, status));
  }

  get boards(): BoardData[] {
    return this.session ? this.accounts.get(this.session)!.boards : [];
  }

  board(id = "board-1"): BoardData {
    return this.boards.find((board) => board.id === id)!;
  }

  install() {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(this.handle(String(input), init)),
      ),
    );
    return this;
  }

  private handle(path: string, init: RequestInit = {}): Response {
    const method = init.method ?? "GET";
    const body: Record<string, unknown> = init.body
      ? JSON.parse(String(init.body))
      : {};
    this.requests.push({ method, path, body });
    const failure = this.failures.get(`${method} ${path}`);
    if (failure) {
      this.failures.delete(`${method} ${path}`);
      return failure;
    }

    if (path.startsWith("/api/auth/")) {
      return this.handleAuth(path.slice("/api/auth/".length), body);
    }
    if (!this.session) {
      return json({ detail: "Not authenticated" }, 401);
    }
    return this.handleBoards(method, path, body);
  }

  private handleAuth(action: string, body: Record<string, unknown>): Response {
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");
    const current = this.session ? this.accounts.get(this.session) : undefined;
    switch (action) {
      case "session":
        return this.session
          ? json({ username: this.session })
          : json({ detail: "Not authenticated" }, 401);
      case "login":
        if (this.accounts.get(username)?.password !== password) {
          return json({ detail: "Invalid username or password" }, 401);
        }
        this.session = username;
        return json({ username });
      case "register":
        if (this.accounts.has(username)) {
          return json({ detail: "That username is already taken" }, 409);
        }
        this.accounts.set(username, {
          password,
          boards: [makeBoard(this.id("board"), "My first board")],
        });
        this.session = username;
        return json({ username }, 201);
      case "logout":
        this.session = null;
        return json({ status: "ok" });
      case "password":
        if (!current) return json({ detail: "Not authenticated" }, 401);
        if (body.current_password !== current.password) {
          return json({ detail: "Current password is incorrect" }, 403);
        }
        current.password = String(body.new_password);
        return json({ status: "ok" });
      case "delete-account":
        if (!current) return json({ detail: "Not authenticated" }, 401);
        if (password !== current.password) {
          return json({ detail: "Password is incorrect" }, 403);
        }
        this.accounts.delete(this.session!);
        this.session = null;
        return json({ status: "ok" });
      default:
        return notFound();
    }
  }

  private handleBoards(
    method: string,
    path: string,
    body: Record<string, unknown>,
  ): Response {
    const parts = path.split("/").slice(3).map(decodeURIComponent);
    const boards = this.accounts.get(this.session!)!.boards;

    if (parts.length === 0) {
      if (method === "POST") {
        const board = makeBoard(this.id("board"), String(body.title));
        board.description = String(body.description ?? "");
        boards.push(board);
        return json(board, 201);
      }
      return json(
        boards.map((board) => ({
          id: board.id,
          title: board.title,
          description: board.description,
          card_count: board.columns.flatMap((column) => column.cards).length,
        })),
      );
    }

    const board = boards.find((item) => item.id === parts[0]);
    if (!board) {
      return notFound();
    }
    const [, resource, resourceId, action] = parts;

    if (!resource) {
      if (method === "DELETE") {
        boards.splice(boards.indexOf(board), 1);
        return new Response(null, { status: 204 });
      }
      if (method === "PATCH") {
        board.title = String(body.title);
        board.description = String(body.description ?? "");
      }
      return json(board);
    }

    if (resource === "columns") {
      const column = board.columns.find((item) => item.id === resourceId);
      if (!column) return notFound();
      column.title = String(body.title);
      return json(column);
    }

    if (resource === "ai") {
      if (!this.chatReply) {
        return json({ detail: "OpenAI is not configured" }, 503);
      }
      const result = this.chatReply(board, String(body.question));
      const index = boards.indexOf(board);
      boards[index] = result.board;
      return json({ reply: result.reply, changed: true, board: result.board });
    }

    const cards = board.columns.flatMap((column) => column.cards);
    if (!resourceId) {
      const column = board.columns.find((item) => item.id === body.column_id);
      if (!column) return notFound();
      const card: BoardCard = {
        ...(body as CardFields),
        id: this.id("card"),
        column_id: column.id,
        position: column.cards.length,
      };
      column.cards.push(card);
      return json(card, 201);
    }

    const card = cards.find((item) => item.id === resourceId);
    if (!card) return notFound();
    const source = board.columns.find((column) => column.id === card.column_id)!;

    if (method === "DELETE") {
      source.cards.splice(source.cards.indexOf(card), 1);
      this.renumber(board);
      return new Response(null, { status: 204 });
    }
    if (action === "move") {
      const destination = board.columns.find(
        (column) => column.id === body.column_id,
      );
      if (!destination) return notFound();
      source.cards.splice(source.cards.indexOf(card), 1);
      const position = Number(body.position);
      if (position > destination.cards.length) {
        source.cards.splice(card.position, 0, card);
        return json({ detail: "Card position is outside the column" }, 422);
      }
      card.column_id = destination.id;
      destination.cards.splice(position, 0, card);
      this.renumber(board);
      return json(card);
    }
    Object.assign(card, body);
    return json(card);
  }

  private renumber(board: BoardData) {
    for (const column of board.columns) {
      column.cards.forEach((card, index) => {
        card.position = index;
      });
    }
  }

  private id(prefix: string): string {
    this.nextId += 1;
    return `${prefix}-${this.nextId}`;
  }
}
