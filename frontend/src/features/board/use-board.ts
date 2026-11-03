"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";
import {
  createCard as createCardRequest,
  deleteCard as deleteCardRequest,
  getBoard,
  moveCard as moveCardRequest,
  renameColumn as renameColumnRequest,
  updateBoard as updateBoardRequest,
  updateCard as updateCardRequest,
} from "./board-api";
import type { BoardData, CardFields } from "./board-data";

type BoardStatus = "loading" | "ready" | "error";

export function useBoard(boardId: string, onChange?: () => void) {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [status, setStatus] = useState<BoardStatus>("loading");
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    getBoard(boardId)
      .then((loadedBoard) => {
        if (active) {
          setBoard(loadedBoard);
          setStatus("ready");
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            errorMessage(loadError, "Unable to load the board. Please try again."),
          );
          setStatus("error");
        }
      });

    return () => {
      active = false;
    };
  }, [boardId, loadAttempt]);

  async function saveMutation(
    mutation: () => Promise<unknown>,
  ): Promise<boolean> {
    setError("");

    try {
      await mutation();
      setBoard(await getBoard(boardId));
      onChange?.();
      return true;
    } catch (mutationError) {
      setError(
        errorMessage(
          mutationError,
          "Unable to update the board. Please try again.",
        ),
      );
      return false;
    }
  }

  function retry() {
    setError("");
    setStatus("loading");
    setLoadAttempt((attempt) => attempt + 1);
  }

  function applyBoardUpdate(updatedBoard: BoardData) {
    setBoard(updatedBoard);
    setError("");
    setStatus("ready");
    onChange?.();
  }

  return {
    board,
    status,
    error,
    retry,
    applyBoardUpdate,
    updateDetails: (title: string, description: string) =>
      saveMutation(() => updateBoardRequest(boardId, title, description)),
    renameColumn: (columnId: string, title: string) =>
      saveMutation(() => renameColumnRequest(boardId, columnId, title)),
    addCard: (columnId: string, fields: CardFields) =>
      saveMutation(() => createCardRequest(boardId, columnId, fields)),
    updateCard: (cardId: string, fields: CardFields) =>
      saveMutation(() => updateCardRequest(boardId, cardId, fields)),
    deleteCard: (cardId: string) =>
      saveMutation(() => deleteCardRequest(boardId, cardId)),
    moveCard: (cardId: string, columnId: string, position: number) =>
      saveMutation(() => moveCardRequest(boardId, cardId, columnId, position)),
  };
}
