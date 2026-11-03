"use client";

import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import type { CardFields, Priority } from "./board-data";
import { CardMetaFields } from "./card-meta";

type AddCardFormProps = {
  columnId: string;
  onAdd: (fields: CardFields) => Promise<boolean>;
  onCancel: () => void;
};

export function AddCardForm({ columnId, onAdd, onCancel }: AddCardFormProps) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setError("Enter a card title.");
      return;
    }

    await onAdd({
      title: trimmedTitle,
      details: details.trim(),
      priority,
      due_date: dueDate || null,
    });
  }

  return (
    <form className="add-card-form" onSubmit={handleSubmit}>
      <label htmlFor={`new-card-title-${columnId}`}>Title</label>
      <input
        autoFocus
        id={`new-card-title-${columnId}`}
        aria-label="Card title"
        maxLength={100}
        onChange={(event) => {
          setTitle(event.target.value);
          setError("");
        }}
        placeholder="Give this card a title"
        required
        value={title}
      />
      <label htmlFor={`new-card-details-${columnId}`}>Details</label>
      <textarea
        id={`new-card-details-${columnId}`}
        aria-label="Details"
        maxLength={500}
        onChange={(event) => setDetails(event.target.value)}
        placeholder="Add a little context"
        rows={3}
        value={details}
      />
      <CardMetaFields
        dueDate={dueDate}
        idPrefix={`new-card-${columnId}`}
        onDueDateChange={setDueDate}
        onPriorityChange={setPriority}
        priority={priority}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="button button-quiet" onClick={onCancel} type="button">
          <X aria-hidden="true" size={15} />
          Cancel
        </button>
        <button className="button button-primary" type="submit">
          <Plus aria-hidden="true" size={15} />
          Add card
        </button>
      </div>
    </form>
  );
}
