import {
  jsonRequest,
  requestJson,
  requestNoContent,
} from "@/lib/api";
import type {
  AIChatResponse,
  BoardCard,
  BoardColumn,
  BoardData,
  BoardSummary,
  CardFields,
  ChatMessage,
} from "./board-data";

function boardPath(boardId: string): string {
  return `/api/boards/${encodeURIComponent(boardId)}`;
}

function cardPath(boardId: string, cardId: string): string {
  return `${boardPath(boardId)}/cards/${encodeURIComponent(cardId)}`;
}

export function listBoards(): Promise<BoardSummary[]> {
  return requestJson<BoardSummary[]>("/api/boards", { cache: "no-store" });
}

export function createBoard(
  title: string,
  description: string,
): Promise<BoardData> {
  return requestJson<BoardData>(
    "/api/boards",
    jsonRequest("POST", { title, description }),
  );
}

export function updateBoard(
  boardId: string,
  title: string,
  description: string,
): Promise<BoardData> {
  return requestJson<BoardData>(
    boardPath(boardId),
    jsonRequest("PATCH", { title, description }),
  );
}

export function deleteBoard(boardId: string): Promise<void> {
  return requestNoContent(boardPath(boardId), { method: "DELETE" });
}

export function getBoard(boardId: string): Promise<BoardData> {
  return requestJson<BoardData>(boardPath(boardId), { cache: "no-store" });
}

export function sendChatMessage(
  boardId: string,
  question: string,
  history: ChatMessage[],
): Promise<AIChatResponse> {
  return requestJson<AIChatResponse>(
    `${boardPath(boardId)}/ai/chat`,
    jsonRequest("POST", { question, history }),
  );
}

export function renameColumn(
  boardId: string,
  columnId: string,
  title: string,
): Promise<BoardColumn> {
  return requestJson<BoardColumn>(
    `${boardPath(boardId)}/columns/${encodeURIComponent(columnId)}`,
    jsonRequest("PATCH", { title }),
  );
}

export function createCard(
  boardId: string,
  columnId: string,
  fields: CardFields,
): Promise<BoardCard> {
  return requestJson<BoardCard>(
    `${boardPath(boardId)}/cards`,
    jsonRequest("POST", { column_id: columnId, ...fields }),
  );
}

export function updateCard(
  boardId: string,
  cardId: string,
  fields: CardFields,
): Promise<BoardCard> {
  return requestJson<BoardCard>(
    cardPath(boardId, cardId),
    jsonRequest("PATCH", fields),
  );
}

export function moveCard(
  boardId: string,
  cardId: string,
  columnId: string,
  position: number,
): Promise<BoardCard> {
  return requestJson<BoardCard>(
    `${cardPath(boardId, cardId)}/move`,
    jsonRequest("PATCH", { column_id: columnId, position }),
  );
}

export function deleteCard(boardId: string, cardId: string): Promise<void> {
  return requestNoContent(cardPath(boardId, cardId), { method: "DELETE" });
}
