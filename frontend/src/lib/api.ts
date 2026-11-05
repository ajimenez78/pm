export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  if (response.status === 401) {
    return new ApiError("Your session has expired. Please sign in again.", 401);
  }

  const body: unknown = await response.json().catch(() => null);
  const detail =
    typeof body === "object" &&
    body !== null &&
    "detail" in body &&
    typeof body.detail === "string"
      ? body.detail
      : "The request failed. Please try again.";
  return new ApiError(detail, response.status);
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Unable to reach the server. Check your connection and try again.",
      );
    }
    throw error;
  }

  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  return response;
}

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await request(path, init);
  return response.json() as Promise<T>;
}

export async function requestNoContent(
  path: string,
  init: RequestInit,
): Promise<void> {
  await request(path, init);
}

export function jsonRequest(
  method: "PATCH" | "POST",
  body: object,
): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
