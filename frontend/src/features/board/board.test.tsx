import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Board } from "./board";

const fetchMock = vi.fn<typeof fetch>();
const board = {
  id: "board-1",
  title: "Product launch",
  columns: [
    {
      id: "backlog",
      title: "Backlog",
      position: 0,
      cards: [
        {
          id: "card-1",
          column_id: "backlog",
          title: "Review brand direction",
          details: "Align the visual identity.",
          position: 0,
        },
      ],
    },
    {
      id: "up-next",
      title: "Up next",
      position: 1,
      cards: [],
    },
  ],
};

function installBoardApiMock() {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "/api/board") {
      return Response.json(board);
    }
    if (init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    return Response.json({});
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("Board", () => {
  it("shows a loading message while the board is being fetched", () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));

    render(<Board />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your board...",
    );
    expect(screen.queryByText("Review brand direction")).not.toBeInTheDocument();
  });

  it("shows a recoverable error when the board request fails", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(Response.json(board));
    const user = userEvent.setup();

    render(<Board />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to reach the server.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Product launch" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders the board returned by the API", async () => {
    installBoardApiMock();

    render(<Board />);

    expect(
      await screen.findByRole("heading", { name: "Product launch" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Backlog" })).toBeInTheDocument();
    expect(screen.getByText("Review brand direction")).toBeInTheDocument();
  });

  it("applies the board returned by chat without reloading it", async () => {
    const updatedBoard = structuredClone(board);
    updatedBoard.columns[1].cards.push({
      id: "card-from-chat",
      column_id: "up-next",
      title: "Prepare launch checklist",
      details: "Created by the AI assistant.",
      position: 0,
    });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === "/api/board") {
        return Response.json(board);
      }
      if (String(input) === "/api/ai/chat" && init?.method === "POST") {
        return Response.json({
          reply: "I added the launch checklist.",
          changed: true,
          board: updatedBoard,
        });
      }
      return Response.json({});
    });
    const user = userEvent.setup();

    render(<Board />);

    await screen.findByRole("heading", { name: "Product launch" });
    await user.click(screen.getByRole("button", { name: "Open AI assistant" }));
    await user.type(
      screen.getByRole("textbox", { name: "Message the AI assistant" }),
      "Add a launch checklist",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Prepare launch checklist")).toBeInTheDocument();
    expect(screen.getByText("I added the launch checklist.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the chat conversation when the assistant is closed and reopened", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === "/api/ai/chat" && init?.method === "POST") {
        return Response.json({
          reply: "Two cards are in progress.",
          changed: false,
          board,
        });
      }
      return Response.json(board);
    });
    const user = userEvent.setup();

    render(<Board />);

    await screen.findByRole("heading", { name: "Product launch" });
    await user.click(screen.getByRole("button", { name: "Open AI assistant" }));
    await user.type(
      screen.getByRole("textbox", { name: "Message the AI assistant" }),
      "What is in progress?",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Two cards are in progress.");

    await user.click(screen.getByRole("button", { name: "Close chat" }));
    expect(screen.queryByText("Two cards are in progress.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open AI assistant" }));

    expect(screen.getByText("What is in progress?")).toBeInTheDocument();
    expect(screen.getByText("Two cards are in progress.")).toBeInTheDocument();
  });

  it("limits column names to the backend maximum length", async () => {
    installBoardApiMock();
    const user = userEvent.setup();
    render(<Board />);

    await screen.findByRole("heading", { name: "Product launch" });
    await user.click(
      screen.getByRole("button", { name: "Rename Backlog column" }),
    );

    expect(
      screen.getByRole("textbox", { name: "Column name" }),
    ).toHaveAttribute("maxLength", "80");
  });

  it("saves a column rename through the API", async () => {
    installBoardApiMock();
    const user = userEvent.setup();
    render(<Board />);

    await screen.findByRole("heading", { name: "Product launch" });
    await user.click(
      screen.getByRole("button", { name: "Rename Backlog column" }),
    );
    const nameInput = screen.getByRole("textbox", { name: "Column name" });
    await user.clear(nameInput);
    await user.type(nameInput, "Ideas");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/board/columns/backlog",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
  });

  it("creates a card through the API", async () => {
    installBoardApiMock();
    const user = userEvent.setup();
    render(<Board />);

    await screen.findByRole("heading", { name: "Product launch" });
    await user.click(
      screen.getByRole("button", { name: "Add card to Backlog" }),
    );
    await user.type(screen.getByRole("textbox", { name: "Card title" }), "Research");
    await user.type(screen.getByRole("textbox", { name: "Details" }), "Review the market");
    await user.click(screen.getByRole("button", { name: "Add card" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/board/cards",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(
      screen.queryByRole("textbox", { name: "Card title" }),
    ).not.toBeInTheDocument();
  });

  it("edits a card through the API", async () => {
    installBoardApiMock();
    const user = userEvent.setup();
    render(<Board />);

    await screen.findByRole("heading", { name: "Product launch" });
    await user.click(
      screen.getByRole("button", {
        name: "Edit card: Review brand direction",
      }),
    );
    await user.clear(screen.getByRole("textbox", { name: "Card title" }));
    await user.type(screen.getByRole("textbox", { name: "Card title" }), "Updated title");
    await user.click(screen.getByRole("button", { name: "Save card" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/board/cards/card-1",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    expect(
      screen.queryByRole("textbox", { name: "Card title" }),
    ).not.toBeInTheDocument();
  });

  it("deletes a card through the API", async () => {
    installBoardApiMock();
    const user = userEvent.setup();
    render(<Board />);

    await screen.findByRole("heading", { name: "Product launch" });
    await user.click(
      screen.getByRole("button", {
        name: "Delete card: Review brand direction",
      }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/board/cards/card-1",
        { method: "DELETE" },
      ),
    );
  });

  it("keeps the card visible and reports a failed API mutation", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(Response.json(board))
      .mockResolvedValueOnce(
        Response.json(
          { detail: "The requested card was not found." },
          { status: 404 },
        ),
      );
    const user = userEvent.setup();
    render(<Board />);

    await screen.findByRole("heading", { name: "Product launch" });
    await user.click(
      screen.getByRole("button", {
        name: "Delete card: Review brand direction",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The requested card was not found.",
    );
    expect(screen.getByText("Review brand direction")).toBeInTheDocument();
  });
});
