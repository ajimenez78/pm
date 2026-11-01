import type { BoardCard, BoardColumn, BoardData } from "./board-data";

function getErrorDetail(body: unknown): string | null {
  if (
    typeof body === "object" &&
    body !== null &&
    "detail" in body &&
    typeof body.detail === "string"
  ) {
    return body.detail;
  }

  return null;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Unable to reach the server. Check your connection and try again.",
      );
    }

    throw error;
  }
}

async function throwResponseError(response: Response): Promise<never> {
  if (response.status === 401) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const bodyText = await response.text();
  if (bodyText) {
    try {
      const body: unknown = JSON.parse(bodyText);
      const detail = getErrorDetail(body);
      if (detail) {
        throw new Error(detail);
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        throw error;
      }
    }
  }

  throw new Error("The board request failed. Please try again.");
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await request(path, init);
  if (!response.ok) {
    await throwResponseError(response);
  }

  return response.json() as Promise<T>;
}

async function requestNoContent(path: string, init: RequestInit): Promise<void> {
  const response = await request(path, init);
  if (!response.ok) {
    await throwResponseError(response);
  }
}

function jsonRequest(method: "PATCH" | "POST", body: object): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function getBoard(): Promise<BoardData> {
  return requestJson<BoardData>("/api/board", { cache: "no-store" });
}

export function renameColumn(
  columnId: string,
  title: string,
): Promise<BoardColumn> {
  return requestJson<BoardColumn>(
    `/api/board/columns/${encodeURIComponent(columnId)}`,
    jsonRequest("PATCH", { title }),
  );
}

export function createCard(
  columnId: string,
  title: string,
  details: string,
): Promise<BoardCard> {
  return requestJson<BoardCard>(
    "/api/board/cards",
    jsonRequest("POST", { column_id: columnId, title, details }),
  );
}

export function updateCard(
  cardId: string,
  title: string,
  details: string,
): Promise<BoardCard> {
  return requestJson<BoardCard>(
    `/api/board/cards/${encodeURIComponent(cardId)}`,
    jsonRequest("PATCH", { title, details }),
  );
}

export function moveCard(
  cardId: string,
  columnId: string,
  position: number,
): Promise<BoardCard> {
  return requestJson<BoardCard>(
    `/api/board/cards/${encodeURIComponent(cardId)}/move`,
    jsonRequest("PATCH", { column_id: columnId, position }),
  );
}

export function deleteCard(cardId: string): Promise<void> {
  return requestNoContent(
    `/api/board/cards/${encodeURIComponent(cardId)}`,
    { method: "DELETE" },
  );
}
