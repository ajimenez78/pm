import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "./auth-gate";

const fetchMock = vi.fn<typeof fetch>();
const boardResponse = Response.json({
  id: "board-1",
  title: "Product launch",
  columns: [],
});

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthGate", () => {
  it("shows the sign-in form without rendering the board when signed out", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    render(<AuthGate />);

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Project board" }),
    ).not.toBeInTheDocument();
  });

  it("shows the board after valid credentials are accepted", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(boardResponse.clone());
    const user = userEvent.setup();

    render(<AuthGate />);

    await user.type(await screen.findByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("region", { name: "Project board" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "user", password: "password" }),
    });
  });

  it("shows an error and keeps the board hidden when credentials are rejected", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const user = userEvent.setup();

    render(<AuthGate />);

    await user.type(await screen.findByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid username or password.",
    );
    expect(
      screen.queryByRole("region", { name: "Project board" }),
    ).not.toBeInTheDocument();
  });

  it("returns to the sign-in form after logout", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(boardResponse.clone())
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const user = userEvent.setup();

    render(<AuthGate />);

    await screen.findByRole("region", { name: "Project board" });
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/auth/logout", {
      method: "POST",
    });
  });
});
