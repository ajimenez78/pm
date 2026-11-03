import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "@/test/fake-api";
import { Workspace } from "./workspace";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderWorkspace(api = new FakeApi().signIn().install()) {
  render(
    <Workspace
      isSigningOut={false}
      onAccountDeleted={vi.fn()}
      onSignOut={vi.fn()}
      signOutError=""
      username="user"
    />,
  );
  await screen.findByRole("heading", { name: "Product launch" });
  return { api, user: userEvent.setup() };
}

describe("Workspace", () => {
  it("creates a board, switches to it, and switches back", async () => {
    const { api, user } = await renderWorkspace();

    await user.click(screen.getByRole("button", { name: "New board" }));
    await user.type(screen.getByLabelText("New board title"), "Website");
    await user.type(screen.getByLabelText("Description"), "Marketing site");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    expect(await screen.findByRole("heading", { name: "Website" })).toBeInTheDocument();
    expect(screen.getByText("Marketing site")).toBeInTheDocument();
    expect(api.boards).toHaveLength(2);
    const switcher = screen.getByRole("combobox", { name: "Current board" });
    expect(switcher).toHaveDisplayValue("Website (0)");

    await user.selectOptions(switcher, "board-1");
    expect(
      await screen.findByRole("heading", { name: "Product launch" }),
    ).toBeInTheDocument();
  });

  it("refreshes board card counts after a change", async () => {
    const { user } = await renderWorkspace();
    const switcher = screen.getByRole("combobox", { name: "Current board" });
    expect(switcher).toHaveDisplayValue("Product launch (3)");

    await user.click(
      screen.getByRole("button", { name: "Delete card: Review brand direction" }),
    );

    await vi.waitFor(() =>
      expect(switcher).toHaveDisplayValue("Product launch (2)"),
    );
  });

  it("shows an empty state after deleting the last board", async () => {
    const { api, user } = await renderWorkspace();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await user.click(screen.getByRole("button", { name: "Delete board" }));

    expect(
      await screen.findByText("You have no boards yet. Create one to get started."),
    ).toBeInTheDocument();
    expect(api.boards).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    await user.type(screen.getByLabelText("New board title"), "Fresh start");
    await user.click(screen.getByRole("button", { name: "Create board" }));
    expect(
      await screen.findByRole("heading", { name: "Fresh start" }),
    ).toBeInTheDocument();
  });

  it("opens account settings and returns to the boards", async () => {
    const { user } = await renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(
      screen.getByRole("heading", { name: "Account settings" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Breadcrumb")).toHaveTextContent("Account");

    await user.click(screen.getByRole("button", { name: "Back to boards" }));
    expect(
      await screen.findByRole("heading", { name: "Product launch" }),
    ).toBeInTheDocument();
  });
});
