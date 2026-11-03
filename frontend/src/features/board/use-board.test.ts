import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "@/test/fake-api";
import { useBoard } from "./use-board";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderReadyBoard(api: FakeApi, onChange = vi.fn()) {
  const hook = renderHook(() => useBoard("board-1", onChange));
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  return hook;
}

describe("useBoard", () => {
  it("loads the requested board", async () => {
    const api = new FakeApi().signIn().install();

    const { result } = await renderReadyBoard(api);

    expect(result.current.board).toEqual(api.board());
  });

  it("shows a clear error and retries a failed board load", async () => {
    const api = new FakeApi().signIn().install();
    api.failNext("GET /api/boards/board-1", 500, "Database unavailable");

    const { result } = renderHook(() => useBoard("board-1"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Database unavailable");

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.board?.title).toBe("Product launch");
  });

  it("reloads the saved board and notifies after each mutation", async () => {
    const api = new FakeApi().signIn().install();
    const onChange = vi.fn();
    const { result } = await renderReadyBoard(api, onChange);

    await act(async () => {
      await result.current.renameColumn("backlog", "Ideas");
      await result.current.addCard("done", {
        title: "Retro",
        details: "",
        priority: "low",
        due_date: "2026-12-01",
      });
      await result.current.updateDetails("Launch", "Q4 launch");
    });

    expect(result.current.board?.columns[0].title).toBe("Ideas");
    expect(result.current.board?.columns[4].cards.at(-1)).toMatchObject({
      title: "Retro",
      priority: "low",
      due_date: "2026-12-01",
    });
    expect(result.current.board?.description).toBe("Q4 launch");
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("keeps the saved board visible and reports a failed mutation", async () => {
    const api = new FakeApi().signIn().install();
    const { result } = await renderReadyBoard(api);
    const before = result.current.board;
    api.failNext(
      "PATCH /api/boards/board-1/cards/card-missing/move",
      404,
      "Card or destination column not found",
    );

    let saved = true;
    await act(async () => {
      saved = await result.current.moveCard("card-missing", "done", 0);
    });

    expect(saved).toBe(false);
    expect(result.current.error).toBe("Card or destination column not found");
    expect(result.current.board).toBe(before);
  });
});
