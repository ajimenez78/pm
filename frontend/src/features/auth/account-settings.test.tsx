import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeApi } from "@/test/fake-api";
import { AccountSettings } from "./account-settings";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderSettings() {
  const api = new FakeApi().signIn().install();
  const onAccountDeleted = vi.fn();
  render(<AccountSettings onAccountDeleted={onAccountDeleted} username="user" />);
  return { api, onAccountDeleted, user: userEvent.setup() };
}

describe("AccountSettings", () => {
  it("changes the password", async () => {
    const { api, user } = renderSettings();

    await user.type(screen.getByLabelText("Current password"), "password");
    await user.type(screen.getByLabelText("New password"), "better-password");
    await user.type(screen.getByLabelText("Confirm new password"), "better-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Password updated.",
    );
    expect(api.accounts.get("user")?.password).toBe("better-password");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("rejects mismatched confirmation and a wrong current password", async () => {
    const { api, user } = renderSettings();

    await user.type(screen.getByLabelText("Current password"), "wrong-one");
    await user.type(screen.getByLabelText("New password"), "better-password");
    await user.type(screen.getByLabelText("Confirm new password"), "different");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The new passwords do not match.",
    );

    await user.clear(screen.getByLabelText("Confirm new password"));
    await user.type(screen.getByLabelText("Confirm new password"), "better-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Current password is incorrect",
    );
    expect(api.accounts.get("user")?.password).toBe("password");
  });

  it("deletes the account after confirmation", async () => {
    const { api, onAccountDeleted, user } = renderSettings();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    await user.type(screen.getByLabelText("Confirm with your password"), "password");
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect(api.accounts.has("user")).toBe(true);

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Delete account" }));

    await vi.waitFor(() => expect(onAccountDeleted).toHaveBeenCalledOnce());
    expect(api.accounts.has("user")).toBe(false);
  });

  it("reports a wrong password when deleting the account", async () => {
    const { onAccountDeleted, user } = renderSettings();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await user.type(screen.getByLabelText("Confirm with your password"), "nope-nope");
    await user.click(screen.getByRole("button", { name: "Delete account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password is incorrect",
    );
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });
});
