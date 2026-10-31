import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Board } from "./board";

describe("Board", () => {
  it("shows a populated board with exactly five columns", () => {
    render(<Board />);

    const board = screen.getByRole("region", { name: "Project board" });

    expect(within(board).getAllByRole("region")).toHaveLength(5);
    expect(
      within(board).getByText("Review brand direction"),
    ).toBeInTheDocument();
  });

  it("renames a column", async () => {
    const user = userEvent.setup();
    render(<Board />);

    await user.click(
      screen.getByRole("button", { name: "Rename Backlog column" }),
    );
    const nameInput = screen.getByRole("textbox", { name: "Column name" });
    await user.clear(nameInput);
    await user.type(nameInput, "Ideas");
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("region", { name: "Ideas" }),
    ).toBeInTheDocument();
  });

  it("adds a card to the chosen column", async () => {
    const user = userEvent.setup();
    render(<Board />);

    await user.click(
      screen.getByRole("button", { name: "Add card to Backlog" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Card title" }),
      "Research",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Details" }),
      "Review the market",
    );
    await user.click(screen.getByRole("button", { name: "Add card" }));

    expect(screen.getByText("Research")).toBeInTheDocument();
    expect(screen.getByText("Review the market")).toBeInTheDocument();
  });

  it("keeps the add form open when the required card title is empty", async () => {
    const user = userEvent.setup();
    render(<Board />);

    await user.click(
      screen.getByRole("button", { name: "Add card to Backlog" }),
    );
    await user.click(screen.getByRole("button", { name: "Add card" }));

    expect(screen.getByRole("textbox", { name: "Card title" })).toBeInvalid();
  });

  it("deletes a card", async () => {
    const user = userEvent.setup();
    render(<Board />);

    await user.click(
      screen.getByRole("button", {
        name: "Delete card: Review brand direction",
      }),
    );

    expect(screen.queryByText("Review brand direction")).not.toBeInTheDocument();
  });
});
