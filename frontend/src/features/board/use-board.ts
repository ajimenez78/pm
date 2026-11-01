"use client";

import { useEffect, useState } from "react";
import {
  createCard as createCardRequest,
  deleteCard as deleteCardRequest,
  getBoard,
  moveCard as moveCardRequest,
  renameColumn as renameColumnRequest,
  updateCard as updateCardRequest,
} from "./board-api";
import type { BoardData } from "./board-data";

type BoardStatus = "loading" | "ready" | "error";

export function useBoard() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [status, setStatus] = useState<BoardStatus>("loading");
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadBoard() {
      try {
        const loadedBoard = await getBoard();
        if (active) {
          setBoard(loadedBoard);
          setStatus("ready");
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load the board. Please try again.",
          );
          setStatus("error");
        }
      }
    }

    void loadBoard();

    return () => {
      active = false;
    };
  }, [loadAttempt]);

  async function saveMutation(
    mutation: () => Promise<unknown>,
  ): Promise<boolean> {
    setError("");

    try {
      await mutation();
      setBoard(await getBoard());
      return true;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Unable to update the board. Please try again.",
      );
      return false;
    }
  }

  function retry() {
    setError("");
    setStatus("loading");
    setLoadAttempt((attempt) => attempt + 1);
  }

  function renameColumn(columnId: string, title: string) {
    return saveMutation(() => renameColumnRequest(columnId, title));
  }

  function addCard(columnId: string, title: string, details: string) {
    return saveMutation(() => createCardRequest(columnId, title, details));
  }

  function updateCard(cardId: string, title: string, details: string) {
    return saveMutation(() => updateCardRequest(cardId, title, details));
  }

  function deleteCard(cardId: string) {
    return saveMutation(() => deleteCardRequest(cardId));
  }

  function moveCard(cardId: string, columnId: string, position: number) {
    return saveMutation(() => moveCardRequest(cardId, columnId, position));
  }

  return {
    board,
    status,
    error,
    retry,
    renameColumn,
    addCard,
    updateCard,
    deleteCard,
    moveCard,
  };
}
