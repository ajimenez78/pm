"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Check,
  GripVertical,
  MoveDown,
  PanelsTopLeft,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { AddCardForm } from "./add-card-form";
import {
  PRIORITIES,
  type BoardCard,
  type BoardColumn,
  type CardFields,
  type ChatMessage,
  type Priority,
} from "./board-data";
import { Card } from "./card";
import { PRIORITY_LABELS } from "./card-meta";
import { ChatPanel } from "./chat-panel";
import { useBoard } from "./use-board";

type ColumnProps = {
  column: BoardColumn;
  visibleCards: BoardCard[];
  isDragging: boolean;
  isEditing: boolean;
  isDropTarget: boolean;
  onAdd: (fields: CardFields) => Promise<boolean>;
  onDelete: (cardId: string) => void;
  onUpdate: (cardId: string, fields: CardFields) => Promise<boolean>;
  onEdit: () => void;
  onRename: (title: string) => Promise<boolean>;
};

function BoardColumnView({
  column,
  visibleCards,
  isDragging,
  isEditing,
  isDropTarget,
  onAdd,
  onDelete,
  onUpdate,
  onEdit,
  onRename,
}: ColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `column:${column.id}`,
  });
  const [isAdding, setIsAdding] = useState(false);
  const [columnName, setColumnName] = useState(column.title);

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = columnName.trim();
    if (trimmedName) {
      await onRename(trimmedName);
    }
  }

  return (
    <section
      aria-labelledby={`column-title-${column.id}`}
      className={`kanban-column${isOver ? " kanban-column-over" : ""}${isDropTarget ? " kanban-column-drop-target" : ""}`}
      ref={setNodeRef}
      role="region"
    >
      <header className="column-header">
        {isEditing ? (
          <form className="rename-column-form" onSubmit={handleRename}>
            <label className="sr-only" htmlFor={`column-name-${column.id}`}>
              Column name
            </label>
            <input
              autoFocus
              id={`column-name-${column.id}`}
              aria-label="Column name"
              maxLength={80}
              onChange={(event) => setColumnName(event.target.value)}
              required
              value={columnName}
            />
            <button
              className="icon-button save-column-name"
              aria-label="Save column name"
              type="submit"
            >
              <Check aria-hidden="true" size={16} />
            </button>
            <button
              className="icon-button cancel-column-name"
              aria-label="Cancel column rename"
              onClick={() => {
                setColumnName(column.title);
                onEdit();
              }}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </form>
        ) : (
          <div className="column-heading">
            <div className="column-title-wrap">
              <span className={`column-dot column-dot-${column.id}`} />
              <h2 id={`column-title-${column.id}`}>{column.title}</h2>
              <span className="column-count">{visibleCards.length}</span>
            </div>
            <button
              className="icon-button rename-column"
              aria-label={`Rename ${column.title} column`}
              onClick={() => {
                setColumnName(column.title);
                onEdit();
              }}
              type="button"
            >
              <Pencil aria-hidden="true" size={14} />
            </button>
          </div>
        )}
      </header>

      <SortableContext
        items={visibleCards.map((card) => card.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="card-list">
          {visibleCards.map((card) => (
            <Card
              card={card}
              key={card.id}
              onDelete={onDelete}
              onEdit={onUpdate}
            />
          ))}
        </div>
      </SortableContext>

      {isDragging && isDropTarget && (
        <div className="drop-target-hint" aria-live="polite">
          <MoveDown aria-hidden="true" size={14} />
          Drop here
        </div>
      )}

      {isAdding ? (
        <AddCardForm
          columnId={column.id}
          onAdd={async (fields) => {
            const saved = await onAdd(fields);
            if (saved) {
              setIsAdding(false);
            }
            return saved;
          }}
          onCancel={() => setIsAdding(false)}
        />
      ) : (
        <button
          className="add-card-trigger"
          aria-label={`Add card to ${column.title}`}
          onClick={() => setIsAdding(true)}
          type="button"
        >
          <Plus aria-hidden="true" size={16} />
          <span>Add a card</span>
        </button>
      )}
    </section>
  );
}

type BoardProps = {
  boardId: string;
  onChange?: () => void;
  onDelete: () => Promise<boolean>;
};

function matchesFilters(
  card: BoardCard,
  query: string,
  priority: Priority | "all",
): boolean {
  const text = `${card.title} ${card.details}`.toLowerCase();
  return (
    text.includes(query.trim().toLowerCase()) &&
    (priority === "all" || card.priority === priority)
  );
}

type BoardDetailsFormProps = {
  title: string;
  description: string;
  onCancel: () => void;
  onSave: (title: string, description: string) => Promise<boolean>;
};

function BoardDetailsForm({
  title: initialTitle,
  description: initialDescription,
  onCancel,
  onSave,
}: BoardDetailsFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim()) {
      await onSave(title.trim(), description.trim());
    }
  }

  return (
    <form className="board-details-form" onSubmit={handleSubmit}>
      <label htmlFor="board-title-input">Board title</label>
      <input
        autoFocus
        id="board-title-input"
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
        required
        value={title}
      />
      <label htmlFor="board-description-input">Board description</label>
      <textarea
        id="board-description-input"
        maxLength={500}
        onChange={(event) => setDescription(event.target.value)}
        rows={2}
        value={description}
      />
      <div className="form-actions">
        <button className="button button-quiet" onClick={onCancel} type="button">
          <X aria-hidden="true" size={15} />
          Cancel
        </button>
        <button className="button button-primary" type="submit">
          <Check aria-hidden="true" size={15} />
          Save board
        </button>
      </div>
    </form>
  );
}

export function Board({ boardId, onChange, onDelete }: BoardProps) {
  const {
    board,
    status,
    error,
    retry,
    updateDetails,
    renameColumn,
    addCard,
    updateCard,
    deleteCard,
    moveCard,
    applyBoardUpdate,
  } = useBoard(boardId, onChange);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">(
    "all",
  );
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const assistantButtonRef = useRef<HTMLButtonElement>(null);
  const columns = board?.columns ?? [];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeCard = columns
    .flatMap((column) => column.cards)
    .find((card) => card.id === activeCardId);
  const cardCount = columns.reduce(
    (total, column) => total + column.cards.length,
    0,
  );
  const isFiltering = query.trim() !== "" || priorityFilter !== "all";
  const visibleCards = Object.fromEntries(
    columns.map((column) => [
      column.id,
      column.cards.filter((card) =>
        matchesFilters(card, query, priorityFilter),
      ),
    ]),
  );
  const visibleCount = Object.values(visibleCards).reduce(
    (total, cards) => total + cards.length,
    0,
  );

  async function handleDeleteBoard() {
    if (
      board &&
      window.confirm(`Delete "${board.title}" and all of its cards?`)
    ) {
      await onDelete();
    }
  }

  const collisionDetection: CollisionDetection = (args) => {
    if (args.pointerCoordinates) {
      return pointerWithin(args);
    }

    return closestCorners(args);
  };

  function getColumnIdForTarget(targetId: string): string | null {
    const column = columns.find(
      (item) => item.id === targetId || `column:${item.id}` === targetId,
    );
    if (column) {
      return column.id;
    }

    return (
      columns.find((item) =>
        item.cards.some((card) => card.id === targetId),
      )?.id ?? null
    );
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveCardId(active.id.toString());
  }

  function handleDragOver({ over }: DragOverEvent) {
    setOverColumnId(over ? getColumnIdForTarget(over.id.toString()) : null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const destinationId = over
      ? getColumnIdForTarget(over.id.toString())
      : null;

    if (destinationId) {
      const cardId = active.id.toString();
      const destination = columns.find((column) => column.id === destinationId);
      const source = columns.find((column) =>
        column.cards.some((card) => card.id === cardId),
      );
      if (destination && source) {
        const targetId = over?.id.toString();
        const targetIndex = destination.cards.findIndex(
          (card) => card.id === targetId,
        );
        const sameColumn = source.id === destination.id;
        const appendedPosition =
          destination.cards.length - Number(sameColumn);
        const targetPosition =
          targetIndex < 0 ? appendedPosition : targetIndex;
        void moveCard(cardId, destinationId, targetPosition);
      }
    }

    setActiveCardId(null);
    setOverColumnId(null);
  }

  function handleDragCancel() {
    setActiveCardId(null);
    setOverColumnId(null);
  }

  function closeChat() {
    setIsChatOpen(false);
    assistantButtonRef.current?.focus();
  }

  if (status === "loading") {
    return (
      <section
        aria-labelledby="board-title"
        className="board-panel"
      >
        <h2 id="board-title">Project board</h2>
        <p role="status">Loading your board...</p>
      </section>
    );
  }

  if (status === "error" || !board) {
    return (
      <section aria-labelledby="board-title" className="board-panel">
        <h2 id="board-title">Project board</h2>
        <p role="alert">{error}</p>
        <button className="button button-primary" onClick={retry} type="button">
          Try again
        </button>
      </section>
    );
  }

  return (
    <section className="board-panel" aria-labelledby="board-title">
      <div className="board-heading">
        <div className="board-heading-copy">
          <p className="board-kicker">
            <span className="board-live-dot" />
            YOUR WORKSPACE
          </p>
          {isEditingDetails ? (
            <BoardDetailsForm
              description={board.description}
              onCancel={() => setIsEditingDetails(false)}
              onSave={async (title, description) => {
                const saved = await updateDetails(title, description);
                if (saved) {
                  setIsEditingDetails(false);
                }
                return saved;
              }}
              title={board.title}
            />
          ) : (
            <>
              <div className="board-title-row">
                <h2 id="board-title">{board.title}</h2>
                <button
                  aria-label="Edit board details"
                  className="icon-button"
                  onClick={() => setIsEditingDetails(true)}
                  title="Edit board details"
                  type="button"
                >
                  <Pencil aria-hidden="true" size={14} />
                </button>
                <button
                  aria-label="Delete board"
                  className="icon-button delete-card"
                  onClick={handleDeleteBoard}
                  title="Delete board"
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={14} />
                </button>
              </div>
              <p className="board-subtitle">
                {board.description ||
                  "A little more clarity, one card at a time."}
              </p>
            </>
          )}
        </div>
        <div className="board-heading-actions">
          <div className="board-summary" aria-label="Board summary">
            <span className="board-summary-icon">
              <PanelsTopLeft aria-hidden="true" size={18} />
            </span>
            <span>
              <strong>{columns.length} columns</strong>
              <span className="summary-separator">/</span>
              <strong>{cardCount} cards</strong>
            </span>
          </div>
          <button
            aria-controls="ai-chat-panel"
            aria-expanded={isChatOpen}
            className="button button-primary ai-chat-toggle"
            onClick={() => setIsChatOpen((open) => !open)}
            ref={assistantButtonRef}
            type="button"
          >
            <Sparkles aria-hidden="true" size={15} />
            {isChatOpen ? "Close AI assistant" : "Open AI assistant"}
          </button>
        </div>
      </div>
      {error && <p className="board-error" role="alert">{error}</p>}

      <div className="board-toolbar">
        <label className="board-search">
          <Search aria-hidden="true" size={14} />
          <span className="sr-only">Search cards</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search cards"
            type="search"
            value={query}
          />
        </label>
        <label className="board-filter">
          <span className="sr-only">Filter by priority</span>
          <select
            onChange={(event) =>
              setPriorityFilter(event.target.value as Priority | "all")
            }
            value={priorityFilter}
          >
            <option value="all">All priorities</option>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {isFiltering && (
          <p className="board-filter-status" role="status">
            Showing {visibleCount} of {cardCount} cards
          </p>
        )}
      </div>

      <div className={`board-body${isChatOpen ? " board-body-chat-open" : ""}`}>
        <DndContext
          collisionDetection={collisionDetection}
          id="kanban-board"
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragStart={handleDragStart}
          sensors={sensors}
        >
          <div className="board-scroll">
            <div aria-label="Project board" className="board-columns" role="region">
              {columns.map((column) => (
                <BoardColumnView
                  column={column}
                  visibleCards={visibleCards[column.id]}
                  isDragging={activeCardId !== null}
                  isEditing={editingColumnId === column.id}
                  isDropTarget={overColumnId === column.id}
                  key={column.id}
                  onAdd={(fields) => addCard(column.id, fields)}
                  onDelete={deleteCard}
                  onUpdate={updateCard}
                  onEdit={() =>
                    setEditingColumnId((current) =>
                      current === column.id ? null : column.id,
                    )
                  }
                  onRename={async (title) => {
                    const saved = await renameColumn(column.id, title);
                    if (saved) {
                      setEditingColumnId(null);
                    }
                    return saved;
                  }}
                />
              ))}
            </div>
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
            {activeCard && (
              <article
                aria-label={`Dragging card: ${activeCard.title}`}
                className="task-card task-card-preview"
                role="region"
              >
                <span aria-hidden="true" className="drag-preview-handle">
                  <GripVertical size={15} />
                </span>
                <h3 className="task-card-title">{activeCard.title}</h3>
                {activeCard.details && (
                  <p className="task-card-details">{activeCard.details}</p>
                )}
              </article>
            )}
          </DragOverlay>
        </DndContext>
        {isChatOpen && (
          <ChatPanel
            boardId={boardId}
            messages={chatMessages}
            onBoardUpdate={applyBoardUpdate}
            onMessagesChange={setChatMessages}
            onClose={closeChat}
          />
        )}
      </div>
    </section>
  );
}
