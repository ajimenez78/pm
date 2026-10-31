"use client";

import { useState } from "react";
import { createInitialColumns, type BoardColumn } from "./board-data";

export function useBoard() {
  const [columns, setColumns] = useState<BoardColumn[]>(createInitialColumns);

  function renameColumn(columnId: string, title: string) {
    setColumns((current) =>
      current.map((column) =>
        column.id === columnId ? { ...column, title } : column,
      ),
    );
  }

  function addCard(columnId: string, title: string, details: string) {
    setColumns((current) =>
      current.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: [...column.cards, { id: crypto.randomUUID(), title, details }],
            }
          : column,
      ),
    );
  }

  function deleteCard(cardId: string) {
    setColumns((current) =>
      current.map((column) => ({
        ...column,
        cards: column.cards.filter((card) => card.id !== cardId),
      })),
    );
  }

  function moveCard(cardId: string, destinationId: string) {
    setColumns((current) => {
      const source = current.find((column) =>
        column.cards.some((card) => card.id === cardId),
      );
      const destination = current.find(
        (column) => column.id === destinationId,
      );
      const card = source?.cards.find((item) => item.id === cardId);

      if (!source || !destination || !card || source.id === destination.id) {
        return current;
      }

      return current.map((column) => {
        if (column.id === source.id) {
          return {
            ...column,
            cards: column.cards.filter((item) => item.id !== cardId),
          };
        }

        if (column.id === destination.id) {
          return { ...column, cards: [...column.cards, card] };
        }

        return column;
      });
    });
  }

  return { columns, renameColumn, addCard, deleteCard, moveCard };
}
