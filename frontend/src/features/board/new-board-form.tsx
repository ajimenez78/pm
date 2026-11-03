"use client";

import { Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";

type NewBoardFormProps = {
  onCreate: (title: string, description: string) => Promise<boolean>;
  onCancel?: () => void;
};

export function NewBoardForm({ onCreate, onCancel }: NewBoardFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    setIsSaving(true);
    await onCreate(title.trim(), description.trim());
    setIsSaving(false);
  }

  return (
    <form
      aria-label="New board"
      className="board-details-form new-board-form"
      onSubmit={handleSubmit}
    >
      <label htmlFor="new-board-title">New board title</label>
      <input
        autoFocus
        id="new-board-title"
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="e.g. Website redesign"
        required
        value={title}
      />
      <label htmlFor="new-board-description">Description</label>
      <textarea
        id="new-board-description"
        maxLength={500}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="What is this board for?"
        rows={2}
        value={description}
      />
      <div className="form-actions">
        {onCancel && (
          <button
            className="button button-quiet"
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" size={15} />
            Cancel
          </button>
        )}
        <button
          className="button button-primary"
          disabled={isSaving}
          type="submit"
        >
          <Plus aria-hidden="true" size={15} />
          Create board
        </button>
      </div>
    </form>
  );
}
