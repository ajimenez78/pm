import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "@/test/fake-api";
import { AuthGate } from "./auth-gate";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function signIn(username: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Username"), username);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return user;
}

describe("AuthGate", () => {
  it("shows the sign-in form without rendering a board when signed out", async () => {
    new FakeApi().install();

    render(<AuthGate />);

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Project board" })).toBeNull();
  });

  it("restores an existing session", async () => {
    new FakeApi().signIn().install();

    render(<AuthGate />);

    expect(
      await screen.findByRole("heading", { name: "Product launch" }),
    ).toBeInTheDocument();
  });

  it("shows the user's board after valid credentials are accepted", async () => {
    const api = new FakeApi().install();

    render(<AuthGate />);
    await signIn("user", "password");

    expect(
      await screen.findByRole("region", { name: "Project board" }),
    ).toBeInTheDocument();
    expect(api.requests).toContainEqual({
      method: "POST",
      path: "/api/auth/login",
      body: { username: "user", password: "password" },
    });
  });

  it("shows an error and keeps the board hidden when credentials are rejected", async () => {
    new FakeApi().install();

    render(<AuthGate />);
    await signIn("user", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid username or password.",
    );
    expect(screen.queryByRole("region", { name: "Project board" })).toBeNull();
  });

  it("creates an account and opens its starter board", async () => {
    const api = new FakeApi().install();
    const user = userEvent.setup();

    render(<AuthGate />);
    await user.click(
      await screen.findByRole("button", { name: "Create an account" }),
    );
    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Username"), "ada");
    await user.type(screen.getByLabelText("Password"), "analytical");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByRole("heading", { name: "My first board" }),
    ).toBeInTheDocument();
    expect(api.accounts.has("ada")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
  });

  it("reports a taken username during registration", async () => {
    new FakeApi().install();
    const user = userEvent.setup();

    render(<AuthGate />);
    await user.click(
      await screen.findByRole("button", { name: "Create an account" }),
    );
    await user.type(screen.getByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "long-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That username is already taken",
    );
    await user.click(screen.getByRole("button", { name: "Sign in instead" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("returns to the sign-in form after logout", async () => {
    new FakeApi().signIn().install();
    const user = userEvent.setup();

    render(<AuthGate />);
    await screen.findByRole("heading", { name: "Product launch" });
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
  });

  it("offers a retry when the session cannot be verified", async () => {
    const api = new FakeApi().install();
    api.failNext("GET /api/auth/session", 500);
    const user = userEvent.setup();

    render(<AuthGate />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to verify your sign-in status.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
  });
});
