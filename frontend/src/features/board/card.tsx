"use client";

import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Pencil, Trash2, X } from "lucide-react";
import type { BoardCard } from "./board-data";

type CardProps = {
  card: BoardCard;
  onDelete: (cardId: string) => void;
  onEdit: (
    cardId: string,
    title: string,
    details: string,
  ) => Promise<boolean>;
};

export function Card({ card, onDelete, onEdit }: CardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [error, setError] = useState("");
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setError("Enter a card title.");
      return;
    }

    const saved = await onEdit(card.id, trimmedTitle, details.trim());
    if (saved) {
      setIsEditing(false);
      setError("");
    }
  }

  function startEditing() {
    setTitle(card.title);
    setDetails(card.details);
    setError("");
    setIsEditing(true);
  }

  function handleCancel() {
    setError("");
    setIsEditing(false);
  }

  return (
    <article
      className={`task-card${isDragging ? " task-card-dragging" : ""}`}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {isEditing ? (
        <form className="edit-card-form" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor={`card-title-${card.id}`}>
            Card title
          </label>
          <input
            autoFocus
            id={`card-title-${card.id}`}
            aria-label="Card title"
            maxLength={100}
            onChange={(event) => {
              setTitle(event.target.value);
              setError("");
            }}
            required
            value={title}
          />
          <label className="sr-only" htmlFor={`card-details-${card.id}`}>
            Details
          </label>
          <textarea
            id={`card-details-${card.id}`}
            aria-label="Details"
            maxLength={500}
            onChange={(event) => setDetails(event.target.value)}
            rows={3}
            value={details}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button button-quiet"
              onClick={handleCancel}
              type="button"
            >
              <X aria-hidden="true" size={15} />
              Cancel
            </button>
            <button className="button button-primary" type="submit">
              <Check aria-hidden="true" size={15} />
              Save card
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="task-card-topline">
            <button
              className="drag-handle"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={`Move card: ${card.title}`}
              type="button"
            >
              <GripVertical aria-hidden="true" size={16} />
            </button>
            <div className="task-card-actions">
              <button
                className="icon-button edit-card"
                aria-label={`Edit card: ${card.title}`}
                onClick={startEditing}
                type="button"
              >
                <Pencil aria-hidden="true" size={14} />
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
          </div>
          <h3 className="task-card-title">{card.title}</h3>
          {card.details && <p className="task-card-details">{card.details}</p>}
        </>
      )}
    </article>
  );
}
