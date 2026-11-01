import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBoard } from "./use-board";

const fetchMock = vi.fn<typeof fetch>();
const initialBoard = {
  id: "board-1",
  title: "Product launch",
  columns: [
    {
      id: "backlog",
      title: "Backlog",
      position: 0,
      cards: [
        {
          id: "card-1",
          column_id: "backlog",
          title: "Review brand direction",
          details: "Align the visual identity.",
          position: 0,
        },
      ],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("useBoard", () => {
  it("loads the board from the authenticated API", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(Response.json(initialBoard));

    const { result } = renderHook(() => useBoard());

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.board).toEqual(initialBoard);
  });

  it("shows a clear error and retries a failed board load", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(Response.json(initialBoard));

    const { result } = renderHook(() => useBoard());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatch(/Unable to reach the server/);

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.board).toEqual(initialBoard);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes the saved board after a successful column rename", async () => {
    vi.stubGlobal("fetch", fetchMock);
    const updatedBoard = {
      ...initialBoard,
      columns: [{ ...initialBoard.columns[0], title: "Ideas" }],
    };
    fetchMock
      .mockResolvedValueOnce(Response.json(initialBoard))
      .mockResolvedValueOnce(
        Response.json({ ...initialBoard.columns[0], title: "Ideas" }),
      )
      .mockResolvedValueOnce(Response.json(updatedBoard));

    const { result } = renderHook(() => useBoard());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await expect(result.current.renameColumn("backlog", "Ideas")).resolves.toBe(
        true,
      );
    });

    expect(result.current.board?.columns[0].title).toBe("Ideas");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/board/columns/backlog",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/board",
      { cache: "no-store" },
    );
  });

  it("keeps the saved board visible and reports a failed mutation", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(Response.json(initialBoard))
      .mockResolvedValueOnce(
        Response.json(
          { detail: "The requested card was not found." },
          { status: 404 },
        ),
      );

    const { result } = renderHook(() => useBoard());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await expect(result.current.deleteCard("missing")).resolves.toBe(false);
    });

    expect(result.current.board).toEqual(initialBoard);
    expect(result.current.error).toBe("The requested card was not found.");
  });
});
