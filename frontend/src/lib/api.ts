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

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
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
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  const bodyText = await response.text();
  let detail: string | null = null;
  try {
    detail = getErrorDetail(JSON.parse(bodyText));
  } catch {
    // Non-JSON error bodies fall through to the generic message.
  }

  throw new ApiError(
    detail ?? "The request failed. Please try again.",
    response.status,
  );
}

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await request(path, init);
  if (!response.ok) {
    await throwResponseError(response);
  }

  return response.json() as Promise<T>;
}

export async function requestNoContent(
  path: string,
  init: RequestInit,
): Promise<void> {
  const response = await request(path, init);
  if (!response.ok) {
    await throwResponseError(response);
  }
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
