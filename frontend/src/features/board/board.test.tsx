import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeApi, makeCard } from "@/test/fake-api";
import { Board } from "./board";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderBoard(api = new FakeApi().signIn().install()) {
  const onChange = vi.fn();
  const onDelete = vi.fn().mockResolvedValue(true);
  render(<Board boardId="board-1" onChange={onChange} onDelete={onDelete} />);
  await screen.findByRole("heading", { name: "Product launch" });
  return { api, onChange, onDelete, user: userEvent.setup() };
}

function column(name: string) {
  return screen.getByRole("region", { name });
}

describe("Board", () => {
  it("shows a loading message while the board is being fetched", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    render(<Board boardId="board-1" onDelete={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your board...",
    );
  });

  it("shows a recoverable error when the board request fails", async () => {
    const api = new FakeApi().signIn().install();
    api.failNext("GET /api/boards/board-1", 500, "Database unavailable");
    const user = userEvent.setup();

    render(<Board boardId="board-1" onDelete={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Product launch" }),
    ).toBeInTheDocument();
  });

  it("renders the columns, cards, and card metadata", async () => {
    await renderBoard();

    expect(column("Backlog")).toBeInTheDocument();
    expect(
      within(column("Backlog")).getByText("Review brand direction"),
    ).toBeInTheDocument();
    expect(within(column("Backlog")).getByText("High")).toBeInTheDocument();
    expect(screen.getByLabelText("Board summary")).toHaveTextContent(
      "5 columns/3 cards",
    );
  });

  it("saves a column rename and limits its length", async () => {
    const { api, onChange, user } = await renderBoard();

    await user.click(screen.getByRole("button", { name: "Rename Backlog column" }));
    const nameInput = screen.getByRole("textbox", { name: "Column name" });
    expect(nameInput).toHaveAttribute("maxLength", "80");
    await user.clear(nameInput);
    await user.type(nameInput, "Ideas{Enter}");

    expect(await screen.findByRole("heading", { name: "Ideas" })).toBeInTheDocument();
    expect(api.board().columns[0].title).toBe("Ideas");
    expect(onChange).toHaveBeenCalled();
  });

  it("creates a card with priority and due date", async () => {
    const { api, user } = await renderBoard();

    await user.click(screen.getByRole("button", { name: "Add card to Up next" }));
    await user.type(screen.getByRole("textbox", { name: "Card title" }), "Research");
    await user.selectOptions(screen.getByLabelText("Priority"), "medium");
    await user.type(screen.getByLabelText("Due date"), "2099-03-04");
    await user.click(screen.getByRole("button", { name: "Add card" }));

    expect(
      await within(column("Up next")).findByText("Research"),
    ).toBeInTheDocument();
    expect(within(column("Up next")).getByText("Medium")).toBeInTheDocument();
    expect(within(column("Up next")).getByText("Due Mar 4, 2099")).toBeInTheDocument();
    expect(api.board().columns[1].cards[0]).toMatchObject({
      title: "Research",
      priority: "medium",
      due_date: "2099-03-04",
    });
    expect(
      screen.queryByRole("textbox", { name: "Card title" }),
    ).not.toBeInTheDocument();
  });

  it("edits a card", async () => {
    const { api, user } = await renderBoard();

    await user.click(
      screen.getByRole("button", { name: "Edit card: Review brand direction" }),
    );
    const title = screen.getByRole("textbox", { name: "Card title" });
    await user.clear(title);
    await user.type(title, "Updated title");
    await user.click(screen.getByRole("button", { name: "Save card" }));

    expect(await screen.findByText("Updated title")).toBeInTheDocument();
    expect(api.board().columns[0].cards[0].title).toBe("Updated title");
  });

  it("deletes a card", async () => {
    const { api, user } = await renderBoard();

    await user.click(
      screen.getByRole("button", { name: "Delete card: Review brand direction" }),
    );

    await within(column("Backlog")).findByText("1");
    expect(screen.queryByText("Review brand direction")).not.toBeInTheDocument();
    expect(api.board().columns[0].cards).toHaveLength(1);
  });

  it("keeps the card visible and reports a failed mutation", async () => {
    const { api, user } = await renderBoard();
    const cardId = api.board().columns[0].cards[0].id;
    api.failNext(
      `DELETE /api/boards/board-1/cards/${cardId}`,
      404,
      "The requested card was not found.",
    );

    await user.click(
      screen.getByRole("button", { name: "Delete card: Review brand direction" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The requested card was not found.",
    );
    expect(screen.getByText("Review brand direction")).toBeInTheDocument();
  });

  it("filters cards by text and priority", async () => {
    const { user } = await renderBoard();

    await user.type(screen.getByRole("searchbox", { name: "Search cards" }), "LAUNCH");
    expect(screen.getByText("Showing 1 of 3 cards")).toBeInTheDocument();
    expect(screen.getByText("Finalize launch brief")).toBeInTheDocument();
    expect(screen.queryByText("Review brand direction")).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Search cards" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by priority" }),
      "high",
    );
    expect(screen.getByText("Plan customer interviews")).toBeInTheDocument();
    expect(screen.queryByText("Finalize launch brief")).not.toBeInTheDocument();
    expect(within(column("Backlog")).getByText("1")).toBeInTheDocument();
  });

  it("edits the board title and description", async () => {
    const { api, onChange, user } = await renderBoard();

    await user.click(screen.getByRole("button", { name: "Edit board details" }));
    const title = screen.getByLabelText("Board title");
    await user.clear(title);
    await user.type(title, "Launch v2");
    await user.type(screen.getByLabelText("Board description"), "Q4 work");
    await user.click(screen.getByRole("button", { name: "Save board" }));

    expect(
      await screen.findByRole("heading", { name: "Launch v2" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Q4 work")).toBeInTheDocument();
    expect(api.board()).toMatchObject({ title: "Launch v2", description: "Q4 work" });
    expect(onChange).toHaveBeenCalled();
  });

  it("deletes the board only after confirmation", async () => {
    const { onDelete, user } = await renderBoard();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);

    await user.click(screen.getByRole("button", { name: "Delete board" }));
    expect(onDelete).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Delete board" }));
    expect(confirm).toHaveBeenLastCalledWith(
      'Delete "Product launch" and all of its cards?',
    );
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("applies the board returned by chat and keeps the conversation", async () => {
    const api = new FakeApi().signIn().install();
    api.chatReply = (board) => {
      const updated = structuredClone(board);
      updated.columns[1].cards.push(
        makeCard("up-next", "Prepare launch checklist"),
      );
      return { reply: "I added the launch checklist.", board: updated };
    };
    const { onChange, user } = await renderBoard(api);

    await user.click(screen.getByRole("button", { name: "Open AI assistant" }));
    await user.type(
      screen.getByRole("textbox", { name: "Message the AI assistant" }),
      "Add a launch checklist",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await within(column("Up next")).findByText("Prepare launch checklist"),
    ).toBeInTheDocument();
    expect(onChange).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Close chat" }));
    expect(screen.queryByText("I added the launch checklist.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open AI assistant" }));
    expect(screen.getByText("I added the launch checklist.")).toBeInTheDocument();
  });
});
