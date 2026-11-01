import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCard,
  deleteCard,
  getBoard,
  moveCard,
  renameColumn,
  updateCard,
} from "./board-api";

const fetchMock = vi.fn<typeof fetch>();

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("board API", () => {
  it("loads the authenticated board without using a cached response", async () => {
    const board = { id: "board-1", title: "Product launch", columns: [] };
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(Response.json(board));

    await expect(getBoard()).resolves.toEqual(board);

    expect(fetchMock).toHaveBeenCalledWith("/api/board", {
      cache: "no-store",
    });
  });

  it("renames a column through the same-origin API", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(Response.json({ id: "backlog", title: "Ideas" }));

    await renameColumn("backlog", "Ideas");

    expect(fetchMock).toHaveBeenCalledWith("/api/board/columns/backlog", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Ideas" }),
    });
  });

  it("creates a card in the selected column through the API", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(Response.json({}, { status: 201 }));

    await createCard("backlog", "Research", "Review the market");

    expect(fetchMock).toHaveBeenCalledWith("/api/board/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        column_id: "backlog",
        title: "Research",
        details: "Review the market",
      }),
    });
  });

  it("updates a card through the API", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(Response.json({}));

    await updateCard("card-1", "Updated title", "Updated details");

    expect(fetchMock).toHaveBeenCalledWith("/api/board/cards/card-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Updated title",
        details: "Updated details",
      }),
    });
  });

  it("moves a card to the requested column position", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(Response.json({}));

    await moveCard("card-1", "up-next", 1);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board/cards/card-1/move",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column_id: "up-next", position: 1 }),
      },
    );
  });

  it("deletes a card without parsing a response body", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await deleteCard("card-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/board/cards/card-1", {
      method: "DELETE",
    });
  });

  it("surfaces API validation errors", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      Response.json({ detail: "Enter a card title." }, { status: 422 }),
    );

    await expect(createCard("backlog", " ", "")).rejects.toThrow(
      "Enter a card title.",
    );
  });

  it("explains when the authenticated session has expired", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      Response.json({ detail: "Not authenticated" }, { status: 401 }),
    );

    await expect(getBoard()).rejects.toThrow(
      "Your session has expired. Please sign in again.",
    );
  });

  it("reports a useful message when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(getBoard()).rejects.toThrow(
      "Unable to reach the server. Check your connection and try again.",
    );
  });
});
