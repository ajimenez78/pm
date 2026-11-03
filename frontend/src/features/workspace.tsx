"use client";

import {
  ChevronRight,
  Command,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Plus,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { AccountSettings } from "@/features/auth/account-settings";
import { Board } from "@/features/board/board";
import { NewBoardForm } from "@/features/board/new-board-form";
import { useBoards } from "@/features/board/use-boards";

type WorkspaceProps = {
  username: string;
  isSigningOut: boolean;
  onSignOut: () => Promise<void>;
  onAccountDeleted: () => void;
  signOutError: string;
};

type View = "boards" | "account";

export function Workspace({
  username,
  isSigningOut,
  onSignOut,
  onAccountDeleted,
  signOutError,
}: WorkspaceProps) {
  const {
    boards,
    selectedId,
    status,
    error,
    retry,
    refresh,
    selectBoard,
    createBoard,
    deleteBoard,
  } = useBoards();
  const [view, setView] = useState<View>("boards");
  const [isCreating, setIsCreating] = useState(false);
  const selectedBoard = boards.find((board) => board.id === selectedId);

  async function handleCreate(title: string, description: string) {
    const created = await createBoard(title, description);
    if (created) {
      setIsCreating(false);
      setView("boards");
    }
    return created;
  }

  function renderBoards() {
    if (status === "loading") {
      return <p role="status">Loading your boards...</p>;
    }
    if (status === "error") {
      return (
        <section className="board-panel">
          <p role="alert">{error}</p>
          <button className="button button-primary" onClick={retry} type="button">
            Try again
          </button>
        </section>
      );
    }
    return (
      <>
        {error && (
          <p className="board-error" role="alert">
            {error}
          </p>
        )}
        {(isCreating || !selectedId) && (
          <section aria-label="Create a board" className="board-panel new-board-panel">
            {!selectedId && (
              <p className="board-subtitle">
                You have no boards yet. Create one to get started.
              </p>
            )}
            <NewBoardForm
              onCancel={selectedId ? () => setIsCreating(false) : undefined}
              onCreate={handleCreate}
            />
          </section>
        )}
        {selectedId && (
          <Board
            boardId={selectedId}
            key={selectedId}
            onChange={refresh}
            onDelete={() => deleteBoard(selectedId)}
          />
        )}
      </>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a aria-label="Northstar home" className="brand" href="#board">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">
            northstar<span>.</span>
          </span>
        </a>

        <div className="workspace-switcher">
          <span className="workspace-icon">
            <Sparkles aria-hidden="true" size={18} />
          </span>
          <span className="workspace-copy">
            <span className="sidebar-overline">WORKSPACE</span>
            <strong>{username}</strong>
          </span>
        </div>

        <nav aria-label="Workspace navigation" className="sidebar-navigation">
          <span className="sidebar-overline">YOUR SPACE</span>
          <button
            aria-current={view === "boards" ? "page" : undefined}
            className="nav-link"
            onClick={() => setView("boards")}
            type="button"
          >
            <LayoutDashboard aria-hidden="true" size={18} />
            <span>Boards</span>
            <span className="nav-count">{boards.length}</span>
          </button>
          <button
            aria-current={view === "account" ? "page" : undefined}
            className="nav-link"
            onClick={() => setView("account")}
            type="button"
          >
            <UserRound aria-hidden="true" size={18} />
            <span>Account</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon">
              <Lightbulb aria-hidden="true" size={17} />
            </span>
            <div>
              <strong>Small steps add up.</strong>
              <p>Keep the important work moving.</p>
            </div>
          </div>
          <div className="sidebar-footnote">
            <span className="sidebar-footnote-mark">
              <Command aria-hidden="true" size={13} />
            </span>
            MADE FOR MOMENTUM
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div aria-label="Breadcrumb" className="breadcrumbs">
            <span>{username}</span>
            <ChevronRight aria-hidden="true" size={15} />
            <strong>
              {view === "account"
                ? "Account"
                : (selectedBoard?.title ?? "Boards")}
            </strong>
          </div>
          <div className="topbar-actions">
            {view === "boards" && boards.length > 0 && (
              <label className="board-switcher">
                <span className="sr-only">Current board</span>
                <select
                  onChange={(event) => selectBoard(event.target.value)}
                  value={selectedId ?? ""}
                >
                  {boards.map((board) => (
                    <option key={board.id} value={board.id}>
                      {board.title} ({board.card_count})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {view === "boards" && status === "ready" && (
              <button
                className="sign-out-button"
                onClick={() => setIsCreating(true)}
                type="button"
              >
                <Plus aria-hidden="true" size={15} />
                New board
              </button>
            )}
            {view === "account" && (
              <button
                className="sign-out-button mobile-nav-button"
                onClick={() => setView("boards")}
                type="button"
              >
                <LayoutDashboard aria-hidden="true" size={15} />
                Back to boards
              </button>
            )}
            {view === "boards" && (
              <button
                aria-label="Account settings"
                className="sign-out-button mobile-nav-button"
                onClick={() => setView("account")}
                type="button"
              >
                <UserRound aria-hidden="true" size={15} />
              </button>
            )}
            {signOutError && (
              <p className="auth-error" role="alert">
                {signOutError}
              </p>
            )}
            <button
              className="sign-out-button"
              disabled={isSigningOut}
              onClick={onSignOut}
              type="button"
            >
              <LogOut aria-hidden="true" size={15} />
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </header>

        <div className="page-content">
          <section aria-labelledby="welcome-title" className="welcome">
            <p className="welcome-eyebrow">
              <span />
              A GOOD DAY TO MAKE PROGRESS
            </p>
            <h1 id="welcome-title">
              Make good ideas <span>happen.</span>
            </h1>
            <p className="welcome-description">
              Bring the next big thing to life, one thoughtful step at a time.
            </p>
          </section>

          <div className="board-anchor" id="board">
            {view === "account" ? (
              <AccountSettings
                onAccountDeleted={onAccountDeleted}
                username={username}
              />
            ) : (
              renderBoards()
            )}
          </div>

          <footer className="page-footer">
            <span>Progress over perfect.</span>
            <span className="footer-divider" />
            <span>Keep going.</span>
          </footer>
        </div>
      </div>
    </main>
  );
}
