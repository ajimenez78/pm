"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, errorMessage } from "@/lib/api";
import { Workspace } from "../workspace";
import { getSession, login, logout, register } from "./auth-api";

type AuthStatus = "checking" | "signed-out" | "signed-in" | "unavailable";
type Mode = "sign-in" | "register";

function submitErrorMessage(mode: Mode, error: unknown): string {
  if (mode === "register") {
    return errorMessage(error, "Unable to create the account.");
  }
  if (error instanceof ApiError && error.status === 401) {
    return "Invalid username or password.";
  }
  return "Unable to sign in. Please try again.";
}

export function AuthGate() {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [mode, setMode] = useState<Mode>("sign-in");
  const [account, setAccount] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [signOutError, setSignOutError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;

    getSession()
      .then((session) => {
        if (active) {
          setAccount(session.username);
          setStatus("signed-in");
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          setStatus("signed-out");
          return;
        }
        setAuthError("Unable to verify your sign-in status.");
        setStatus("unavailable");
      });

    return () => {
      active = false;
    };
  }, [retryCount]);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setAuthError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setIsSubmitting(true);

    try {
      const authenticate = mode === "sign-in" ? login : register;
      const session = await authenticate(username, password);
      setPassword("");
      setAccount(session.username);
      setStatus("signed-in");
    } catch (error) {
      setAuthError(submitErrorMessage(mode, error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function showSignIn() {
    setMode("sign-in");
    setStatus("signed-out");
  }

  async function handleSignOut() {
    setSignOutError("");
    setIsSigningOut(true);

    try {
      await logout();
      showSignIn();
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
        onAccountDeleted={showSignIn}
        onSignOut={handleSignOut}
        signOutError={signOutError}
        username={account}
      />
    );
  }

  const isSignIn = mode === "sign-in";
  const title = isSignIn ? "Sign in" : "Create account";
  const pendingLabel = isSignIn ? "Signing in..." : "Creating account...";

  return (
    <main className="auth-page">
      <section aria-labelledby="sign-in-title" className="auth-card">
        <Link aria-label="Northstar" className="auth-brand" href="/">
          northstar<span>.</span>
        </Link>
        <p className="auth-eyebrow">YOUR PROJECT WORKSPACE</p>
        <h1 id="sign-in-title">{title}</h1>
        <p className="auth-description">
          {isSignIn
            ? "Sign in to continue to your project boards."
            : "Create an account to start organizing your projects."}
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="username">Username</label>
          <input
            autoComplete="username"
            id="username"
            maxLength={isSignIn ? undefined : 32}
            minLength={isSignIn ? undefined : 3}
            onChange={(event) => setUsername(event.target.value)}
            pattern={isSignIn ? undefined : "[A-Za-z0-9_.\\-]+"}
            required
            title={
              isSignIn
                ? undefined
                : "3 to 32 letters, numbers, dots, dashes, or underscores"
            }
            value={username}
          />
          <label htmlFor="password">Password</label>
          <input
            autoComplete={isSignIn ? "current-password" : "new-password"}
            id="password"
            maxLength={isSignIn ? undefined : 128}
            minLength={isSignIn ? undefined : 8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {!isSignIn && (
            <p className="auth-hint">At least 8 characters.</p>
          )}
          {authError && (
            <p className="auth-error" role="alert">
              {authError}
            </p>
          )}
          <button className="auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? pendingLabel : title}
          </button>
        </form>
        <p className="auth-note">
          {isSignIn ? "New here? " : "Already have an account? "}
          <button
            className="auth-switch"
            onClick={() => switchMode(isSignIn ? "register" : "sign-in")}
            type="button"
          >
            {isSignIn ? "Create an account" : "Sign in instead"}
          </button>
        </p>
      </section>
    </main>
  );
}
