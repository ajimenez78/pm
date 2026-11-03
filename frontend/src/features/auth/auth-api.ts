import { jsonRequest, requestJson } from "@/lib/api";

type Account = { username: string };

export function getSession(): Promise<Account> {
  return requestJson<Account>("/api/auth/session", { cache: "no-store" });
}

export function login(username: string, password: string): Promise<Account> {
  return requestJson<Account>(
    "/api/auth/login",
    jsonRequest("POST", { username, password }),
  );
}

export function register(
  username: string,
  password: string,
): Promise<Account> {
  return requestJson<Account>(
    "/api/auth/register",
    jsonRequest("POST", { username, password }),
  );
}

export function logout(): Promise<unknown> {
  return requestJson("/api/auth/logout", { method: "POST" });
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<unknown> {
  return requestJson(
    "/api/auth/password",
    jsonRequest("POST", {
      current_password: currentPassword,
      new_password: newPassword,
    }),
  );
}

export function deleteAccount(password: string): Promise<unknown> {
  return requestJson(
    "/api/auth/delete-account",
    jsonRequest("POST", { password }),
  );
}
