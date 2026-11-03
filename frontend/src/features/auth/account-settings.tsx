"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api";
import { changePassword, deleteAccount } from "./auth-api";

type AccountSettingsProps = {
  username: string;
  onAccountDeleted: () => void;
};

export function AccountSettings({
  username,
  onAccountDeleted,
}: AccountSettingsProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage(
        "Password updated. Other devices have been signed out.",
      );
    } catch (error) {
      setPasswordError(errorMessage(error, "Unable to change the password."));
    }
  }

  async function handleDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteError("");
    if (
      !window.confirm(
        "Permanently delete your account and all of your boards?",
      )
    ) {
      return;
    }
    try {
      await deleteAccount(deletePassword);
      onAccountDeleted();
    } catch (error) {
      setDeleteError(errorMessage(error, "Unable to delete the account."));
    }
  }

  return (
    <section aria-labelledby="account-title" className="board-panel account-panel">
      <p className="board-kicker">
        <span className="board-live-dot" />
        ACCOUNT
      </p>
      <h2 id="account-title">Account settings</h2>
      <p className="board-subtitle">
        Signed in as <strong>{username}</strong>
      </p>

      <form
        aria-labelledby="change-password-title"
        className="account-form"
        onSubmit={handlePasswordChange}
      >
        <h3 id="change-password-title">Change password</h3>
        <label htmlFor="current-password">Current password</label>
        <input
          autoComplete="current-password"
          id="current-password"
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          type="password"
          value={currentPassword}
        />
        <label htmlFor="new-password">New password</label>
        <input
          autoComplete="new-password"
          id="new-password"
          maxLength={128}
          minLength={8}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          type="password"
          value={newPassword}
        />
        <label htmlFor="confirm-password">Confirm new password</label>
        <input
          autoComplete="new-password"
          id="confirm-password"
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
        {passwordError && (
          <p className="form-error" role="alert">
            {passwordError}
          </p>
        )}
        {passwordMessage && <p role="status">{passwordMessage}</p>}
        <button className="button button-primary" type="submit">
          Update password
        </button>
      </form>

      <form
        aria-labelledby="delete-account-title"
        className="account-form account-danger"
        onSubmit={handleDelete}
      >
        <h3 id="delete-account-title">Delete account</h3>
        <p>This permanently removes your account and every board you own.</p>
        <label htmlFor="delete-password">Confirm with your password</label>
        <input
          autoComplete="current-password"
          id="delete-password"
          onChange={(event) => setDeletePassword(event.target.value)}
          required
          type="password"
          value={deletePassword}
        />
        {deleteError && (
          <p className="form-error" role="alert">
            {deleteError}
          </p>
        )}
        <button className="button button-danger" type="submit">
          Delete account
        </button>
      </form>
    </section>
  );
}
