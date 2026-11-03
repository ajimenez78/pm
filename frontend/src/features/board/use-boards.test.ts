import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "@/test/fake-api";
import { useBoards } from "./use-boards";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderReady() {
  const hook = renderHook(() => useBoards());
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  return hook;
}

describe("useBoards", () => {
  it("selects the first board by default", async () => {
    new FakeApi().signIn().install();

    const { result } = await renderReady();

    expect(result.current.boards.map((board) => board.title)).toEqual([
      "Product launch",
    ]);
    expect(result.current.selectedId).toBe("board-1");
  });

  it("creates and selects a board, remembering the selection", async () => {
    new FakeApi().signIn().install();
    const { result } = await renderReady();

    await act(async () => {
      await result.current.createBoard("Website", "");
    });

    const created = result.current.boards[1];
    expect(created.title).toBe("Website");
    expect(result.current.selectedId).toBe(created.id);

    const second = await renderReady();
    expect(second.result.current.selectedId).toBe(created.id);
  });

  it("falls back to another board after deleting the selected one", async () => {
    const api = new FakeApi().signIn().install();
    const { result } = await renderReady();
    await act(async () => {
      await result.current.createBoard("Website", "");
    });

    await act(async () => {
      await result.current.deleteBoard(result.current.selectedId!);
    });

    expect(result.current.selectedId).toBe("board-1");
    expect(api.boards).toHaveLength(1);

    await act(async () => {
      await result.current.deleteBoard("board-1");
    });
    expect(result.current.selectedId).toBeNull();
  });

  it("reports failures and retries the initial load", async () => {
    const api = new FakeApi().signIn().install();
    api.failNext("GET /api/boards", 500, "Database unavailable");

    const { result } = renderHook(() => useBoards());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Database unavailable");

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    api.failNext("POST /api/boards", 422, "Invalid title");
    let created = true;
    await act(async () => {
      created = await result.current.createBoard("x", "");
    });
    expect(created).toBe(false);
    expect(result.current.error).toBe("Invalid title");
  });
});
