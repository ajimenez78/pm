import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBoard,
  createCard,
  deleteBoard,
  deleteCard,
  getBoard,
  listBoards,
  moveCard,
  renameColumn,
  sendChatMessage,
  updateBoard,
  updateCard,
} from "./board-api";

const fetchMock = vi.fn<typeof fetch>();
const fields = {
  title: "Plan",
  details: "Notes",
  priority: "high" as const,
  due_date: "2026-12-01",
};

function json(method: string, body: object) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("board API", () => {
  it.each([
    ["lists boards", () => listBoards(), "/api/boards", { cache: "no-store" }],
    [
      "loads one board without caching",
      () => getBoard("b 1"),
      "/api/boards/b%201",
      { cache: "no-store" },
    ],
    [
      "creates a board",
      () => createBoard("Web", "Site"),
      "/api/boards",
      json("POST", { title: "Web", description: "Site" }),
    ],
    [
      "updates a board",
      () => updateBoard("b1", "Web", ""),
      "/api/boards/b1",
      json("PATCH", { title: "Web", description: "" }),
    ],
    [
      "renames a column",
      () => renameColumn("b1", "backlog", "Ideas"),
      "/api/boards/b1/columns/backlog",
      json("PATCH", { title: "Ideas" }),
    ],
    [
      "creates a card with metadata",
      () => createCard("b1", "backlog", fields),
      "/api/boards/b1/cards",
      json("POST", { column_id: "backlog", ...fields }),
    ],
    [
      "updates a card",
      () => updateCard("b1", "c1", fields),
      "/api/boards/b1/cards/c1",
      json("PATCH", fields),
    ],
    [
      "moves a card",
      () => moveCard("b1", "c1", "done", 2),
      "/api/boards/b1/cards/c1/move",
      json("PATCH", { column_id: "done", position: 2 }),
    ],
    [
      "sends a chat question with history",
      () =>
        sendChatMessage("b1", "Add a task", [
          { role: "assistant", content: "Hi" },
        ]),
      "/api/boards/b1/ai/chat",
      json("POST", {
        question: "Add a task",
        history: [{ role: "assistant", content: "Hi" }],
      }),
    ],
  ])("%s", async (_name, call, path, init) => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(Response.json({ ok: true }));

    await expect(call()).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(path, init);
  });

  it.each([
    ["a board", () => deleteBoard("b1"), "/api/boards/b1"],
    ["a card", () => deleteCard("b1", "c1"), "/api/boards/b1/cards/c1"],
  ])("deletes %s without parsing a response body", async (_name, call, path) => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(call()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(path, { method: "DELETE" });
  });
});
