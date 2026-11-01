"use client";

import { Send, Sparkles, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { sendChatMessage } from "./board-api";
import type { BoardData, ChatMessage } from "./board-data";

type ChatPanelProps = {
  onBoardUpdate: (board: BoardData) => void;
  onClose: () => void;
};

export function ChatPanel({ onBoardUpdate, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const questionInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    questionInput.current?.focus();
  }, []);

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isSending) {
      return;
    }

    setIsSending(true);
    setError("");
    try {
      const response = await sendChatMessage(trimmedQuestion, messages.slice(-20));
      setMessages((currentMessages) => [
        ...currentMessages,
        { role: "user", content: trimmedQuestion },
        { role: "assistant", content: response.reply },
      ]);
      onBoardUpdate(response.board);
      setQuestion("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The assistant could not respond. Please try again.",
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      onClose();
    }
  }

  return (
    <aside
      aria-labelledby="ai-chat-title"
      className="ai-chat-panel"
      id="ai-chat-panel"
      onKeyDown={handleKeyDown}
      role="complementary"
    >
      <header className="ai-chat-header">
        <div className="ai-chat-heading">
          <span aria-hidden="true" className="ai-chat-icon">
            <Sparkles size={18} />
          </span>
          <div>
            <h2 id="ai-chat-title">AI assistant</h2>
            <p>Ask about your project board</p>
          </div>
        </div>
        <button
          aria-label="Close chat"
          className="icon-button ai-chat-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </header>

      <div
        aria-label="Chat messages"
        aria-live="polite"
        aria-relevant="additions"
        className="ai-chat-messages"
        role="log"
      >
        {messages.length === 0 ? (
          <p className="ai-chat-welcome">
            I can answer questions about your board or help create, edit, and
            move cards.
          </p>
        ) : (
          messages.map((message, index) => (
            <article
              className={`ai-chat-message ai-chat-message-${message.role}`}
              key={`${index}-${message.role}`}
            >
              <span>{message.role === "user" ? "You" : "Assistant"}</span>
              <p>{message.content}</p>
            </article>
          ))
        )}
        {isSending && (
          <p className="ai-chat-pending" role="status">
            Thinking about your board...
          </p>
        )}
      </div>

      {error && (
        <p className="ai-chat-error" role="alert">
          {error}
        </p>
      )}

      <form className="ai-chat-form" onSubmit={submitQuestion}>
        <label className="sr-only" htmlFor="ai-chat-question">
          Message the AI assistant
        </label>
        <textarea
          id="ai-chat-question"
          maxLength={2000}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask a question or request a card change..."
          ref={questionInput}
          rows={3}
          value={question}
        />
        <button
          className="button button-primary ai-chat-send"
          disabled={isSending || !question.trim()}
          type="submit"
        >
          <Send aria-hidden="true" size={15} />
          Send message
        </button>
      </form>
    </aside>
  );
}
