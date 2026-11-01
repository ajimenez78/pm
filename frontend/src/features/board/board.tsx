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
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { AddCardForm } from "./add-card-form";
import type { BoardColumn } from "./board-data";
import { Card } from "./card";
import { useBoard } from "./use-board";

type ColumnProps = {
  column: BoardColumn;
  isDragging: boolean;
  isEditing: boolean;
  isDropTarget: boolean;
  onAdd: (title: string, details: string) => Promise<boolean>;
  onDelete: (cardId: string) => void;
  onUpdate: (
    cardId: string,
    title: string,
    details: string,
  ) => Promise<boolean>;
  onEdit: () => void;
  onRename: (title: string) => Promise<boolean>;
};

function BoardColumnView({
  column,
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
              <span className="column-count">{column.cards.length}</span>
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
        items={column.cards.map((card) => card.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="card-list">
          {column.cards.map((card) => (
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
          onAdd={async (title, details) => {
            const saved = await onAdd(title, details);
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

export function Board() {
  const {
    board,
    status,
    error,
    retry,
    renameColumn,
    addCard,
    updateCard,
    deleteCard,
    moveCard,
  } = useBoard();
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
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
          <h2 id="board-title">{board.title}</h2>
          <p className="board-subtitle">
            A little more clarity, one card at a time.
          </p>
        </div>
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
      </div>
      {error && <p className="board-error" role="alert">{error}</p>}

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
                isDragging={activeCardId !== null}
                isEditing={editingColumnId === column.id}
                isDropTarget={overColumnId === column.id}
                key={column.id}
                onAdd={(title, details) =>
                  addCard(column.id, title, details)
                }
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
    </section>
  );
}
