import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./chat-panel";
import type { BoardData, ChatMessage } from "./board-data";

type HarnessProps = {
  onBoardUpdate: (board: BoardData) => void;
  onClose: () => void;
};

function ChatPanelHarness({ onBoardUpdate, onClose }: HarnessProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  return (
    <ChatPanel
      boardId="board-1"
      messages={messages}
      onBoardUpdate={onBoardUpdate}
      onClose={onClose}
      onMessagesChange={setMessages}
    />
  );
}

const fetchMock = vi.fn<typeof fetch>();
const board: BoardData = {
  id: "board-1",
  title: "Product launch",
  description: "",
  columns: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("ChatPanel", () => {
  it("submits a question, displays the reply, and applies the returned board", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      Response.json({
        reply: "I added the task.",
        changed: true,
        board,
      }),
    );
    const onBoardUpdate = vi.fn();
    const user = userEvent.setup();

    render(<ChatPanelHarness onBoardUpdate={onBoardUpdate} onClose={vi.fn()} />);

    const input = screen.getByRole("textbox", {
      name: "Message the AI assistant",
    });
    expect(input).toHaveFocus();
    await user.type(input, "Add a task");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("I added the task.")).toBeInTheDocument();
    expect(onBoardUpdate).toHaveBeenCalledWith(board);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/board-1/ai/chat",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText("Add a task")).toBeInTheDocument();
  });

  it("shows a pending state and disables sending while the reply is loading", async () => {
    vi.stubGlobal("fetch", fetchMock);
    let resolveResponse: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    const user = userEvent.setup();

    render(<ChatPanelHarness onBoardUpdate={vi.fn()} onClose={vi.fn()} />);

    await user.type(
      screen.getByRole("textbox", { name: "Message the AI assistant" }),
      "Summarize the board",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Thinking about your board...",
    );
    expect(
      screen.getByRole("button", { name: "Send message" }),
    ).toBeDisabled();

    resolveResponse(
      Response.json({ reply: "No changes needed.", changed: false, board }),
    );
    expect(await screen.findByText("No changes needed.")).toBeInTheDocument();
  });

  it("shows an API error and lets the user retry", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(
        Response.json(
          { detail: "The AI service is unavailable." },
          { status: 502 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          reply: "I can help now.",
          changed: false,
          board,
        }),
      );
    const user = userEvent.setup();

    render(<ChatPanelHarness onBoardUpdate={vi.fn()} onClose={vi.fn()} />);

    const input = screen.getByRole("textbox", {
      name: "Message the AI assistant",
    });
    await user.type(input, "Summarize the board");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The AI service is unavailable.",
    );
    expect(input).toHaveValue("Summarize the board");

    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("I can help now.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("includes the previous exchange and closes on Escape", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ reply: "One task is in progress.", changed: false, board }),
      )
      .mockResolvedValueOnce(
        Response.json({ reply: "I moved it.", changed: false, board }),
      );
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<ChatPanelHarness onBoardUpdate={vi.fn()} onClose={onClose} />);

    const input = screen.getByRole("textbox", {
      name: "Message the AI assistant",
    });
    await user.type(input, "What's in progress?");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("One task is in progress.");
    await user.clear(input);
    await user.type(input, "Move it to Done");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("I moved it.");

    await waitFor(() => {
      const requestBody = JSON.parse(
        String(fetchMock.mock.calls[1][1]?.body),
      ) as { history: unknown[] };
      expect(requestBody.history).toEqual([
        { role: "user", content: "What's in progress?" },
        { role: "assistant", content: "One task is in progress." },
      ]);
    });
    await user.click(input);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
