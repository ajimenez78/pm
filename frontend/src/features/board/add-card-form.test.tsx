import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddCardForm } from "./add-card-form";

describe("AddCardForm", () => {
  it("adds a trimmed title and details", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddCardForm columnId="backlog" onAdd={onAdd} onCancel={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: "Card title" }), " Plan launch ");
    await user.type(screen.getByRole("textbox", { name: "Details" }), "  Brief the team  ");
    await user.click(screen.getByRole("button", { name: "Add card" }));

    expect(onAdd).toHaveBeenCalledWith({
      title: "Plan launch",
      details: "Brief the team",
      priority: "none",
      due_date: null,
    });
  });

  it("requires a title before adding a card", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddCardForm columnId="backlog" onAdd={onAdd} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add card" }));

    expect(screen.getByRole("textbox", { name: "Card title" })).toBeInvalid();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows a message when the title contains only whitespace", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddCardForm columnId="backlog" onAdd={onAdd} onCancel={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: "Card title" }), "   ");
    await user.click(screen.getByRole("button", { name: "Add card" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a card title.");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("includes the chosen priority and due date", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddCardForm columnId="backlog" onAdd={onAdd} onCancel={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: "Card title" }), "Ship");
    await user.selectOptions(screen.getByLabelText("Priority"), "medium");
    await user.type(screen.getByLabelText("Due date"), "2026-12-31");
    await user.click(screen.getByRole("button", { name: "Add card" }));

    expect(onAdd).toHaveBeenCalledWith({
      title: "Ship",
      details: "",
      priority: "medium",
      due_date: "2026-12-31",
    });
  });
});
