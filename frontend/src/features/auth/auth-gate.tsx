"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Workspace } from "../workspace";

type AuthStatus = "checking" | "signed-out" | "signed-in" | "unavailable";

export function AuthGate() {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [signOutError, setSignOutError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;

    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => {
        if (!active) {
          return;
        }
        if (response.status === 401) {
          setStatus("signed-out");
          return;
        }
        if (!response.ok) {
          throw new Error("Session check failed.");
        }
        setStatus("signed-in");
      })
      .catch(() => {
        if (active) {
          setAuthError("Unable to verify your sign-in status.");
          setStatus("unavailable");
        }
      });

    return () => {
      active = false;
    };
  }, [retryCount]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (response.status === 401) {
        setAuthError("Invalid username or password.");
        return;
      }
      if (!response.ok) {
        throw new Error("Sign-in request failed.");
      }

      setPassword("");
      setStatus("signed-in");
    } catch {
      setAuthError("Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setSignOutError("");
    setIsSigningOut(true);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Sign-out request failed.");
      }
      setStatus("signed-out");
    } catch {
      setSignOutError("Unable to sign out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  if (status === "checking") {
    return (
      <main className="auth-page">
        <p role="status">Checking your sign-in...</p>
      </main>
    );
  }

  if (status === "unavailable") {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Sign-in unavailable</h1>
          <p role="alert">{authError}</p>
          <button
            className="auth-submit"
            onClick={() => {
              setAuthError("");
              setStatus("checking");
              setRetryCount((count) => count + 1);
            }}
            type="button"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (status === "signed-in") {
    return (
      <Workspace
        isSigningOut={isSigningOut}
        onSignOut={handleSignOut}
        signOutError={signOutError}
      />
    );
  }

  return (
    <main className="auth-page">
      <section aria-labelledby="sign-in-title" className="auth-card">
        <Link aria-label="Northstar" className="auth-brand" href="/">
          northstar<span>.</span>
        </Link>
        <p className="auth-eyebrow">YOUR PROJECT WORKSPACE</p>
        <h1 id="sign-in-title">Sign in</h1>
        <p className="auth-description">
          Sign in to continue to your project board.
        </p>
        <form className="auth-form" onSubmit={handleLogin}>
          <label htmlFor="username">Username</label>
          <input
            autoComplete="username"
            id="username"
            onChange={(event) => setUsername(event.target.value)}
            required
            value={username}
          />
          <label htmlFor="password">Password</label>
          <input
            autoComplete="current-password"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {authError && (
            <p className="auth-error" role="alert">
              {authError}
            </p>
          )}
          <button className="auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="auth-note">Local MVP sign-in</p>
      </section>
    </main>
  );
}
