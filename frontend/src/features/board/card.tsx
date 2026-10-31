"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import type { BoardCard } from "./board-data";

type CardProps = {
  card: BoardCard;
  onDelete: (cardId: string) => void;
};

export function Card({ card, onDelete }: CardProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id });

  return (
    <article
      className={`task-card${isDragging ? " task-card-dragging" : ""}`}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="task-card-topline">
        <button
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label={`Move card: ${card.title}`}
          type="button"
        >
          <GripVertical aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button delete-card"
          aria-label={`Delete card: ${card.title}`}
          onClick={() => onDelete(card.id)}
          type="button"
        >
          <Trash2 aria-hidden="true" size={15} />
        </button>
      </div>
      <h3 className="task-card-title">{card.title}</h3>
      {card.details && <p className="task-card-details">{card.details}</p>}
    </article>
  );
}
