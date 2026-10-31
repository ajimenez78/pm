import { DndContext } from "@dnd-kit/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Card } from "./card";

describe("Card", () => {
  it("shows its title and details", () => {
    render(
      <DndContext>
        <Card
          card={{ id: "card-1", title: "Plan launch", details: "Brief the team" }}
          onDelete={vi.fn()}
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
          card={{ id: "card-1", title: "Plan launch", details: "" }}
          onDelete={onDelete}
        />
      </DndContext>,
    );

    await user.click(screen.getByRole("button", { name: "Delete card: Plan launch" }));

    expect(onDelete).toHaveBeenCalledWith("card-1");
  });
});
