import { DndContext } from "@dnd-kit/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BoardCard } from "./board-data";
import { Card } from "./card";
import { localIsoDate } from "./card-meta";

const baseCard: BoardCard = {
  id: "card-1",
  column_id: "backlog",
  title: "Plan launch",
  details: "",
  position: 0,
  priority: "none",
  due_date: null,
};

function renderCard(card: BoardCard, onEdit = vi.fn()) {
  return render(
    <DndContext>
      <Card card={card} onDelete={vi.fn()} onEdit={onEdit} />
    </DndContext>,
  );
}

describe("Card", () => {
  it("shows its title and details", () => {
    render(
      <DndContext>
        <Card
          card={{
            id: "card-1",
            column_id: "backlog",
            title: "Plan launch",
            details: "Brief the team",
            position: 0,
            priority: "none",
            due_date: null,
          }}
          onDelete={vi.fn()}
          onEdit={vi.fn()}
        />
      </DndContext>,
    );

    expect(screen.getByRole("heading", { name: "Plan launch" })).toBeInTheDocument();
    expect(screen.getByText("Brief the team")).toBeInTheDocument();
  });

  it("deletes the selected card", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <DndContext>
        <Card
          card={{
            id: "card-1",
            column_id: "backlog",
            title: "Plan launch",
            details: "",
            position: 0,
            priority: "none",
            due_date: null,
          }}
          onDelete={onDelete}
          onEdit={vi.fn()}
        />
      </DndContext>,
    );

    await user.click(screen.getByRole("button", { name: "Delete card: Plan launch" }));

    expect(onDelete).toHaveBeenCalledWith("card-1");
  });

  it("edits the latest card content after the card changes", async () => {
    const user = userEvent.setup();
    const card: BoardCard = {
      id: "card-1",
      column_id: "backlog",
      title: "Plan launch",
      details: "Brief the team",
      position: 0,
      priority: "none",
      due_date: null,
    };
    const { rerender } = render(
      <DndContext>
        <Card card={card} onDelete={vi.fn()} onEdit={vi.fn()} />
      </DndContext>,
    );

    rerender(
      <DndContext>
        <Card
          card={{ ...card, title: "Plan AI launch", details: "Updated by AI" }}
          onDelete={vi.fn()}
          onEdit={vi.fn()}
        />
      </DndContext>,
    );
    await user.click(screen.getByRole("button", { name: "Edit card: Plan AI launch" }));

    expect(screen.getByRole("textbox", { name: "Card title" })).toHaveValue(
      "Plan AI launch",
    );
    expect(screen.getByRole("textbox", { name: "Details" })).toHaveValue(
      "Updated by AI",
    );
  });

  it("cancels editing with the icon button without saving", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <DndContext>
        <Card
          card={{
            id: "card-1",
            column_id: "backlog",
            title: "Plan launch",
            details: "",
            position: 0,
            priority: "none",
            due_date: null,
          }}
          onDelete={vi.fn()}
          onEdit={onEdit}
        />
      </DndContext>,
    );

    await user.click(screen.getByRole("button", { name: "Edit card: Plan launch" }));
    await user.type(screen.getByRole("textbox", { name: "Card title" }), " now");
    await user.click(screen.getByRole("button", { name: "Cancel editing" }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Plan launch" })).toBeInTheDocument();
  });

  it("shows priority and due date badges", () => {
    renderCard({ ...baseCard, priority: "high", due_date: "2020-01-02" });

    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Overdue Jan 2, 2020")).toBeInTheDocument();
  });

  it("does not flag finished cards as overdue", () => {
    renderCard({ ...baseCard, column_id: "done", due_date: "2020-01-02" });

    expect(screen.getByText("Due Jan 2, 2020")).toBeInTheDocument();
  });

  it("highlights cards that are due today", () => {
    renderCard({ ...baseCard, due_date: localIsoDate() });

    expect(screen.getByText("Due today")).toBeInTheDocument();
  });

  it("saves edited priority and due date and can clear them", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn().mockResolvedValue(true);
    renderCard({ ...baseCard, priority: "low", due_date: "2030-05-01" }, onEdit);

    await user.click(screen.getByRole("button", { name: "Edit card: Plan launch" }));
    expect(screen.getByLabelText("Priority")).toHaveValue("low");
    expect(screen.getByLabelText("Due date")).toHaveValue("2030-05-01");
    await user.selectOptions(screen.getByLabelText("Priority"), "high");
    await user.clear(screen.getByLabelText("Due date"));
    await user.click(screen.getByRole("button", { name: "Save card" }));

    expect(onEdit).toHaveBeenCalledWith("card-1", {
      title: "Plan launch",
      details: "",
      priority: "high",
      due_date: null,
    });
  });
});
