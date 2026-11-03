import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, requestJson, requestNoContent } from "./api";

const fetchMock = vi.fn<typeof fetch>();

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("API requests", () => {
  it("surfaces the server's error detail with its status", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      Response.json({ detail: "Column not found" }, { status: 404 }),
    );

    const error = await requestJson("/api/x").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Column not found", status: 404 });
  });

  it("uses a generic message for non-JSON or structured validation errors", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }))
      .mockResolvedValueOnce(
        Response.json({ detail: [{ msg: "invalid" }] }, { status: 422 }),
      );

    await expect(requestJson("/api/x")).rejects.toThrow(
      "The request failed. Please try again.",
    );
    await expect(
      requestNoContent("/api/x", { method: "DELETE" }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("explains when the authenticated session has expired", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(requestJson("/api/x")).rejects.toMatchObject({
      message: "Your session has expired. Please sign in again.",
      status: 401,
    });
  });

  it("reports a useful message when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(requestJson("/api/x")).rejects.toThrow(
      "Unable to reach the server. Check your connection and try again.",
    );
  });
});
