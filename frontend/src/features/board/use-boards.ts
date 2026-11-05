"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";
import {
  createBoard as createBoardRequest,
  deleteBoard as deleteBoardRequest,
  listBoards,
} from "./board-api";
import type { BoardSummary } from "./board-data";

const SELECTED_BOARD_KEY = "pm.selectedBoard";

function readStoredBoardId(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_BOARD_KEY);
  } catch {
    return null;
  }
}

function storeBoardId(boardId: string | null) {
  try {
    if (boardId) {
      window.localStorage.setItem(SELECTED_BOARD_KEY, boardId);
    } else {
      window.localStorage.removeItem(SELECTED_BOARD_KEY);
    }
  } catch {
    // Remembering the selection is a convenience only.
  }
}

function pickBoard(
  boards: BoardSummary[],
  preferred: string | null,
): string | null {
  if (preferred && boards.some((board) => board.id === preferred)) {
    return preferred;
  }
  return boards[0]?.id ?? null;
}

export function useBoards() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    listBoards()
      .then((loaded) => {
        if (active) {
          setBoards(loaded);
          setSelectedId(pickBoard(loaded, readStoredBoardId()));
          setStatus("ready");
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(errorMessage(loadError, "Unable to load your boards."));
          setStatus("error");
        }
      });

    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const refresh = useCallback(async () => {
    try {
      setBoards(await listBoards());
    } catch {
      // The board view reports its own errors; a stale list is harmless.
    }
  }, []);

  function selectBoard(boardId: string | null) {
    setSelectedId(boardId);
    storeBoardId(boardId);
  }

  function retry() {
    setError("");
    setStatus("loading");
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function createBoard(
    title: string,
    description: string,
  ): Promise<boolean> {
    setError("");
    try {
      const board = await createBoardRequest(title, description);
      setBoards(await listBoards());
      selectBoard(board.id);
      return true;
    } catch (createError) {
      setError(errorMessage(createError, "Unable to create the board."));
      return false;
    }
  }

  async function deleteBoard(boardId: string): Promise<boolean> {
    setError("");
    try {
      await deleteBoardRequest(boardId);
      const remaining = await listBoards();
      setBoards(remaining);
      selectBoard(pickBoard(remaining, null));
      return true;
    } catch (deleteError) {
      setError(errorMessage(deleteError, "Unable to delete the board."));
      return false;
    }
  }

  return {
    boards,
    selectedId,
    status,
    error,
    retry,
    refresh,
    selectBoard,
    createBoard,
    deleteBoard,
  };
}
