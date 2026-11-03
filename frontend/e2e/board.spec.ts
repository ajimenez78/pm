import { expect, test, type Page } from "@playwright/test";

// These tests run against the real FastAPI backend serving the static export.
// Each test registers its own account, so tests are isolated from each other
// and from existing data. Only the OpenAI-backed chat endpoint is stubbed.

const PASSWORD = "e2e-password";
const SAMPLE_CARDS = [
  ["backlog", "Review brand direction", "Align the visual identity."],
  ["backlog", "Plan customer interviews", "Prepare a short guide."],
  ["up-next", "Write product page copy", ""],
  ["done", "Finalize launch brief", ""],
] as const;

type Account = { username: string; password: string };
const accounts = new WeakMap<Page, Account>();

function uniqueUsername(): string {
  return `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createAccount(page: Page): Promise<Account> {
  const account = { username: uniqueUsername(), password: PASSWORD };
  const response = await page.request.post("/api/auth/register", {
    data: account,
  });
  expect(response.status()).toBe(201);
  accounts.set(page, account);
  return account;
}

/** Register a user whose starter board holds the sample cards, then open it. */
async function openSampleBoard(page: Page): Promise<string> {
  await createAccount(page);
  const [starter] = await (await page.request.get("/api/boards")).json();
  await page.request.patch(`/api/boards/${starter.id}`, {
    data: { title: "Product launch", description: "" },
  });
  for (const [columnId, title, details] of SAMPLE_CARDS) {
    await page.request.post(`/api/boards/${starter.id}/cards`, {
      data: { column_id: columnId, title, details },
    });
  }
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Product launch" }),
  ).toBeVisible();
  return starter.id;
}

function column(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

async function waitForKeyboardSensor(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => window.setTimeout(resolve, 0)),
  );
}

test.afterEach(async ({ page }) => {
  const account = accounts.get(page);
  if (account) {
    // Sign in again in case the test signed out, then remove the account.
    await page.request.post("/api/auth/login", { data: account });
    await page.request.post("/api/auth/delete-account", {
      data: { password: account.password },
    });
  }
});

test("keeps a direct board visit behind the sign-in screen", async ({ page }) => {
  await page.goto("/#board");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Project board" })).toHaveCount(0);
});

test("creates an account, signs out, and signs back in", async ({ page }) => {
  const account = { username: uniqueUsername(), password: PASSWORD };
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  accounts.set(page, account);

  await expect(page.getByRole("heading", { name: "My first board" })).toBeVisible();
  await expect(page.getByLabel("Breadcrumb")).toContainText(account.username);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();

  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "My first board" })).toBeVisible();
});

test("opens a populated board with five columns", async ({ page }) => {
  await openSampleBoard(page);

  const board = page.getByRole("region", { name: "Project board" });
  await expect(board.getByRole("region")).toHaveCount(5);
  await expect(board.getByText("Review brand direction")).toBeVisible();
});

test("manages several boards and keeps their cards separate", async ({ page }) => {
  await openSampleBoard(page);

  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("New board title").fill("Website redesign");
  await page.getByLabel("Description").fill("Marketing site refresh");
  await page.getByRole("button", { name: "Create board" }).click();

  await expect(page.getByRole("heading", { name: "Website redesign" })).toBeVisible();
  await expect(page.getByText("Marketing site refresh")).toBeVisible();
  await expect(page.getByText("Review brand direction")).toHaveCount(0);
  await page.getByRole("button", { name: "Add card to Backlog" }).click();
  await page.getByRole("textbox", { name: "Card title" }).fill("Audit pages");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(column(page, "Backlog").getByText("Audit pages")).toBeVisible();

  const switcher = page.getByRole("combobox", { name: "Current board" });
  await expect(switcher).toContainText("Website redesign (1)");
  await switcher.selectOption({ label: "Product launch (4)" });
  await expect(page.getByRole("heading", { name: "Product launch" })).toBeVisible();
  await expect(page.getByText("Audit pages")).toHaveCount(0);

  // The selected board is remembered across reloads.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Product launch" })).toBeVisible();

  await page.getByRole("button", { name: "Edit board details" }).click();
  await page.getByLabel("Board title").fill("Launch plan");
  await page.getByRole("button", { name: "Save board" }).click();
  await expect(page.getByRole("heading", { name: "Launch plan" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete board" }).click();
  await expect(page.getByRole("heading", { name: "Website redesign" })).toBeVisible();
  await expect(switcher.locator("option")).toHaveCount(1);
});

test("does not expose another user's board", async ({ page, browser }) => {
  const boardId = await openSampleBoard(page);
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await createAccount(other);

  const response = await other.request.get(`/api/boards/${boardId}`);
  expect(response.status()).toBe(404);
  await other.goto("/");
  await expect(other.getByRole("heading", { name: "My first board" })).toBeVisible();
  await expect(other.getByText("Review brand direction")).toHaveCount(0);

  const account = accounts.get(other)!;
  await other.request.post("/api/auth/delete-account", {
    data: { password: account.password },
  });
  await otherContext.close();
});

test("chats with the assistant and immediately shows its board changes", async ({
  page,
}) => {
  const boardId = await openSampleBoard(page);
  let submitted: { question: string; history: unknown[] } | null = null;
  // Stand in for the model: perform the change through the real API and
  // return the persisted board, as the backend would.
  await page.route("**/api/boards/*/ai/chat", async (route) => {
    submitted = route.request().postDataJSON();
    await page.request.post(`/api/boards/${boardId}/cards`, {
      data: {
        column_id: "up-next",
        title: "Prepare launch checklist",
        priority: "high",
      },
    });
    const board = await (await page.request.get(`/api/boards/${boardId}`)).json();
    await route.fulfill({
      json: {
        reply: "I added the launch checklist to Up next.",
        changed: true,
        board,
      },
    });
  });

  await page.getByRole("button", { name: "Open AI assistant" }).click();
  await page
    .getByRole("textbox", { name: "Message the AI assistant" })
    .fill("Add a launch checklist");
  await page.getByRole("button", { name: "Send message" }).click();

  const upNext = column(page, "Up next");
  await expect(upNext.getByText("Prepare launch checklist")).toBeVisible();
  await expect(upNext.getByText("High")).toBeVisible();
  await expect(page.getByText("I added the launch checklist to Up next.")).toBeVisible();
  expect(submitted).toEqual({ question: "Add a launch checklist", history: [] });
  await expect(
    page.getByRole("combobox", { name: "Current board" }),
  ).toContainText("Product launch (5)");

  await page.reload();
  await expect(column(page, "Up next").getByText("Prepare launch checklist")).toBeVisible();
});

test("keeps the chat keyboard accessible on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSampleBoard(page);

  const assistantButton = page.getByRole("button", { name: "Open AI assistant" });
  await assistantButton.click();

  const composer = page.getByRole("textbox", { name: "Message the AI assistant" });
  await expect(composer).toBeVisible();
  await expect(composer).toBeFocused();
  await composer.press("Escape");

  await expect(page.getByRole("complementary", { name: "AI assistant" })).toHaveCount(0);
  await expect(assistantButton).toBeFocused();
});

test("renames a column and adds, edits, and deletes a card with metadata", async ({
  page,
}) => {
  await openSampleBoard(page);

  await page.getByRole("button", { name: "Rename Backlog column" }).click();
  const columnName = page.getByRole("textbox", { name: "Column name" });
  await columnName.fill("Ideas");
  await columnName.press("Enter");
  const ideas = column(page, "Ideas");
  await expect(ideas).toBeVisible();

  await page.getByRole("button", { name: "Add card to Ideas" }).click();
  await page.getByRole("textbox", { name: "Card title" }).fill("Research");
  await page.getByRole("textbox", { name: "Details" }).fill("Review the market");
  await ideas.getByLabel("Priority").selectOption("medium");
  await ideas.getByLabel("Due date").fill("2020-01-15");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(ideas.getByText("Research")).toBeVisible();
  await expect(ideas.getByText("Medium")).toBeVisible();
  await expect(ideas.getByText("Overdue Jan 15, 2020")).toBeVisible();

  await page.getByRole("button", { name: "Edit card: Research" }).click();
  await page.getByRole("textbox", { name: "Card title" }).fill("Market research");
  await ideas.getByLabel("Priority").selectOption("high");
  await ideas.getByLabel("Due date").fill("");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(ideas.getByRole("heading", { name: "Market research" })).toBeVisible();
  await expect(ideas.getByText("High")).toBeVisible();
  await expect(ideas.getByText(/Overdue/)).toHaveCount(0);

  await page.getByRole("button", { name: "Delete card: Market research" }).click();
  await expect(page.getByText("Market research")).toHaveCount(0);
});

test("filters cards by search text and priority", async ({ page }) => {
  await openSampleBoard(page);

  await page.getByRole("searchbox", { name: "Search cards" }).fill("brand");
  await expect(page.getByText("Showing 1 of 4 cards")).toBeVisible();
  await expect(page.getByText("Plan customer interviews")).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Search cards" }).fill("");
  await page.getByRole("combobox", { name: "Filter by priority" }).selectOption("high");
  await expect(page.getByText("Showing 0 of 4 cards")).toBeVisible();
});

test("moves a card between columns with drag and drop", async ({ page }) => {
  await openSampleBoard(page);

  const backlog = column(page, "Backlog");
  const upNext = column(page, "Up next");
  const cardTitle = "Review brand direction";
  await backlog
    .getByRole("button", { name: `Move card: ${cardTitle}` })
    .dragTo(upNext, { steps: 10 });

  await expect(upNext.getByText(cardTitle)).toBeVisible();
  await expect(backlog.getByText(cardTitle)).toHaveCount(0);

  await page.reload();
  await expect(column(page, "Up next").getByText(cardTitle)).toBeVisible();
});

test("reorders cards within a column with drag and drop", async ({ page }) => {
  await openSampleBoard(page);

  const backlog = column(page, "Backlog");
  await backlog
    .getByRole("button", { name: "Move card: Review brand direction" })
    .dragTo(
      backlog.getByRole("button", { name: "Move card: Plan customer interviews" }),
      { steps: 10 },
    );

  const headings = backlog.getByRole("heading", { level: 3 });
  await expect(headings.first()).toHaveText("Plan customer interviews");
  await expect(headings.nth(1)).toHaveText("Review brand direction");
});

test("shows the dragged card and a clear destination before dropping", async ({
  page,
}) => {
  await openSampleBoard(page);

  const backlog = column(page, "Backlog");
  const upNext = column(page, "Up next");
  const handleBounds = await backlog
    .getByRole("button", { name: "Move card: Review brand direction" })
    .boundingBox();
  const destinationBounds = await upNext.boundingBox();
  if (!handleBounds || !destinationBounds) {
    throw new Error("The card handle and destination column must be visible.");
  }

  await page.mouse.move(
    handleBounds.x + handleBounds.width / 2,
    handleBounds.y + handleBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handleBounds.x + handleBounds.width / 2 + 12, handleBounds.y + 8);
  await expect(
    page.getByRole("region", { name: "Dragging card: Review brand direction" }),
  ).toBeVisible();

  await page.mouse.move(
    destinationBounds.x + destinationBounds.width / 2,
    destinationBounds.y + destinationBounds.height - 18,
    { steps: 8 },
  );
  await expect(upNext.getByText("Drop here")).toBeVisible();
  await expect(upNext).toHaveClass(/kanban-column-drop-target/);

  await page.mouse.up();
  await expect(upNext.getByText("Review brand direction")).toBeVisible();
});

test("cancels a keyboard drag without moving the card", async ({ page }) => {
  await openSampleBoard(page);

  const backlog = column(page, "Backlog");
  const cardTitle = "Review brand direction";
  await backlog.getByRole("button", { name: `Move card: ${cardTitle}` }).focus();
  await page.keyboard.press("Space");
  const preview = page.getByRole("region", { name: `Dragging card: ${cardTitle}` });
  await expect(preview).toBeVisible();
  await waitForKeyboardSensor(page);
  await page.keyboard.press("Escape");

  await expect(backlog.getByText(cardTitle)).toBeVisible();
  await expect(preview).toHaveCount(0);
});

test("dropping outside the board leaves the card where it started", async ({
  page,
}) => {
  await openSampleBoard(page);

  const backlog = column(page, "Backlog");
  const cardTitle = "Review brand direction";
  const handleBounds = await backlog
    .getByRole("button", { name: `Move card: ${cardTitle}` })
    .boundingBox();
  if (!handleBounds) {
    throw new Error("The card handle must be visible.");
  }

  await page.mouse.move(
    handleBounds.x + handleBounds.width / 2,
    handleBounds.y + handleBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handleBounds.x + handleBounds.width / 2 + 12, handleBounds.y + 8);
  const preview = page.getByRole("region", { name: `Dragging card: ${cardTitle}` });
  await expect(preview).toBeVisible();
  await page.mouse.move(20, 20, { steps: 8 });
  await page.mouse.up();

  await expect(backlog.getByText(cardTitle)).toBeVisible();
  await expect(preview).toHaveCount(0);
});

test("moves a card between columns with the keyboard", async ({ page }) => {
  await openSampleBoard(page);

  await page.getByRole("button", { name: "Move card: Review brand direction" }).focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("region", { name: "Dragging card: Review brand direction" }),
  ).toBeVisible();
  await waitForKeyboardSensor(page);
  await page.keyboard.press("ArrowRight");
  await expect(column(page, "Up next").getByText("Drop here")).toBeVisible();
  await page.keyboard.press("Space");

  await expect(
    column(page, "Up next").getByText("Review brand direction"),
  ).toBeVisible();
});

test("keeps board changes after reload", async ({ page }) => {
  await openSampleBoard(page);

  await page.getByRole("button", { name: "Rename Backlog column" }).click();
  await page.getByRole("textbox", { name: "Column name" }).fill("Ideas");
  await page.getByRole("textbox", { name: "Column name" }).press("Enter");
  await page.getByRole("button", { name: "Add card to Ideas" }).click();
  await page.getByRole("textbox", { name: "Card title" }).fill("Saved research");
  await column(page, "Ideas").getByLabel("Priority").selectOption("low");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(column(page, "Ideas").getByText("Saved research")).toBeVisible();

  await page.reload();

  const ideas = column(page, "Ideas");
  await expect(ideas.getByText("Saved research")).toBeVisible();
  await expect(ideas.getByText("Low")).toBeVisible();
});

test("changes the password and deletes the account", async ({ page }) => {
  const account = await createAccount(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My first board" })).toBeVisible();

  await page.getByRole("button", { name: "Account settings" }).click();
  await page.getByLabel("Current password").fill(account.password);
  await page.getByLabel("New password", { exact: true }).fill("changed-password");
  await page.getByLabel("Confirm new password").fill("changed-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();
  account.password = "changed-password";

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password").fill("changed-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "My first board" })).toBeVisible();

  await page.getByRole("button", { name: "Account settings" }).click();
  await page.getByLabel("Confirm with your password").fill("changed-password");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete account" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const login = await page.request.post("/api/auth/login", { data: account });
  expect(login.status()).toBe(401);
  accounts.delete(page);
});

test("keeps all five columns usable in a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSampleBoard(page);

  const board = page.getByRole("region", { name: "Project board" });
  await expect(board.getByRole("region")).toHaveCount(5);
  await expect(column(page, "Backlog")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Current board" })).toBeVisible();

  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(pageOverflows).toBe(false);
});
