"use client";

import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";

type AddCardFormProps = {
  onAdd: (title: string, details: string) => void;
  onCancel: () => void;
};

export function AddCardForm({ onAdd, onCancel }: AddCardFormProps) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setError("Enter a card title.");
      return;
    }

    onAdd(trimmedTitle, details.trim());
  }

  return (
    <form className="add-card-form" onSubmit={handleSubmit}>
      <label htmlFor="new-card-title">Title</label>
      <input
        autoFocus
        id="new-card-title"
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
      <label htmlFor="new-card-details">Details</label>
      <textarea
        id="new-card-details"
        aria-label="Details"
        maxLength={500}
        onChange={(event) => setDetails(event.target.value)}
        placeholder="Add a little context"
        rows={3}
        value={details}
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
