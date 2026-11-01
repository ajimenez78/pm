import { expect, test, type Page } from "@playwright/test";

async function waitForKeyboardSensor(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => window.setTimeout(resolve, 0)),
  );
}

async function installAuthApi(page: Page) {
  let isSignedIn = false;
  const initialBoard = {
    id: "board-1",
    title: "Product launch",
    columns: [
      {
        id: "backlog",
        title: "Backlog",
        position: 0,
        cards: [
          {
            id: "card-brand-audit",
            column_id: "backlog",
            title: "Review brand direction",
            details: "Align the visual identity with the new product story.",
            position: 0,
          },
          {
            id: "card-customer-interviews",
            column_id: "backlog",
            title: "Plan customer interviews",
            details: "Prepare a short guide for five early-access customers.",
            position: 1,
          },
        ],
      },
      {
        id: "up-next",
        title: "Up next",
        position: 1,
        cards: [
          {
            id: "card-product-copy",
            column_id: "up-next",
            title: "Write product page copy",
            details: "Keep the first fold clear, confident, and concise.",
            position: 0,
          },
        ],
      },
      {
        id: "in-progress",
        title: "In progress",
        position: 2,
        cards: [
          {
            id: "card-onboarding",
            column_id: "in-progress",
            title: "Design onboarding flow",
            details: "Map the first three minutes of the product experience.",
            position: 0,
          },
          {
            id: "card-dashboard",
            column_id: "in-progress",
            title: "Build analytics dashboard",
            details: "Bring the key launch metrics together in one view.",
            position: 1,
          },
        ],
      },
      {
        id: "in-review",
        title: "In review",
        position: 3,
        cards: [
          {
            id: "card-email-sequence",
            column_id: "in-review",
            title: "Review welcome emails",
            details: "Check tone and links before the first send.",
            position: 0,
          },
        ],
      },
      {
        id: "done",
        title: "Done",
        position: 4,
        cards: [
          {
            id: "card-launch-brief",
            column_id: "done",
            title: "Finalize launch brief",
            details: "Share the goals, timeline, and owners with the team.",
            position: 0,
          },
        ],
      },
    ],
  };
  const board = structuredClone(initialBoard);

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: isSignedIn ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify(
        isSignedIn ? { username: "user" } : { detail: "Not authenticated" },
      ),
    }),
  );
  await page.route("**/api/auth/login", async (route) => {
    isSignedIn = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ username: "user" }),
    });
  });
  await page.route("**/api/auth/logout", async (route) => {
    isSignedIn = false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" }),
    });
  });
  await page.route("**/api/board", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(board),
    }),
  );
  await page.route("**/api/board/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split("/").filter(Boolean);
    const method = request.method();
    const payload = (request.postDataJSON() ?? {}) as Record<string, unknown>;

    if (path[2] === "columns" && method === "PATCH") {
      const column = board.columns.find((item) => item.id === path[3]);
      if (column && typeof payload.title === "string") {
        column.title = payload.title;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(column),
        });
        return;
      }
    }

    if (path[2] === "cards" && path.length === 3 && method === "POST") {
      const column = board.columns.find(
        (item) => item.id === payload.column_id,
      );
      if (column && typeof payload.title === "string") {
        const card = {
          id: `e2e-${Date.now()}`,
          column_id: column.id,
          title: payload.title,
          details: typeof payload.details === "string" ? payload.details : "",
          position: column.cards.length,
        };
        column.cards.push(card);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(card),
        });
        return;
      }
    }

    if (path[2] === "cards" && path.length === 4 && method === "PATCH") {
      const card = board.columns
        .flatMap((column) => column.cards)
        .find((item) => item.id === path[3]);
      if (
        card &&
        typeof payload.title === "string" &&
        typeof payload.details === "string"
      ) {
        card.title = payload.title;
        card.details = payload.details;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(card),
        });
        return;
      }
    }

    if (
      path[2] === "cards" &&
      path[4] === "move" &&
      method === "PATCH" &&
      typeof payload.column_id === "string" &&
      typeof payload.position === "number"
    ) {
      const source = board.columns.find((column) =>
        column.cards.some((card) => card.id === path[3]),
      );
      const destination = board.columns.find(
        (column) => column.id === payload.column_id,
      );
      const card = source?.cards.find((item) => item.id === path[3]);
      if (source && destination && card) {
        source.cards = source.cards.filter((item) => item.id !== card.id);
        card.column_id = destination.id;
        destination.cards.splice(payload.position, 0, card);
        for (const column of board.columns) {
          column.cards.forEach((item, position) => {
            item.position = position;
          });
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(card),
        });
        return;
      }
    }

    if (path[2] === "cards" && path.length === 4 && method === "DELETE") {
      for (const column of board.columns) {
        const cardIndex = column.cards.findIndex(
          (item) => item.id === path[3],
        );
        if (cardIndex !== -1) {
          column.cards.splice(cardIndex, 1);
          column.cards.forEach((item, position) => {
            item.position = position;
          });
          await route.fulfill({ status: 204 });
          return;
        }
      }
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Board resource not found." }),
    });
  });
}

async function openBoard(page: Page, useRealApi = false) {
  if (!useRealApi) {
    await installAuthApi(page);
  }
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("region", { name: "Project board" }),
  ).toBeVisible();
}

test("keeps a direct board visit behind the sign-in screen", async ({ page }) => {
  await installAuthApi(page);
  await page.goto("/#board");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Project board" }),
  ).toHaveCount(0);
});

test("signs in, shows the board, and returns to sign in after logout", async ({
  page,
}) => {
  await installAuthApi(page);
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("region", { name: "Project board" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Project board" }),
  ).toHaveCount(0);
});

test("opens one populated board with five columns", async ({ page }) => {
  await openBoard(page);

  const board = page.getByRole("region", { name: "Project board" });
  await expect(board.getByRole("region")).toHaveCount(5);
  await expect(board.getByText("Review brand direction")).toBeVisible();
});

test("renames a column and adds then deletes a card", async ({ page }) => {
  await openBoard(page);

  await page.getByRole("button", { name: "Rename Backlog column" }).click();
  const columnName = page.getByRole("textbox", { name: "Column name" });
  await columnName.fill("Ideas");
  await columnName.press("Enter");
  await expect(
    page.getByRole("region", { name: "Ideas", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add card to Ideas" }).click();
  await page.getByRole("textbox", { name: "Card title" }).fill("Research");
  await page.getByRole("textbox", { name: "Details" }).fill("Review the market");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByText("Research")).toBeVisible();

  await page.getByRole("button", { name: "Delete card: Research" }).click();
  await expect(page.getByText("Research")).toHaveCount(0);
});

test("edits a card title and details", async ({ page }) => {
  await openBoard(page);

  await page
    .getByRole("button", { name: "Edit card: Review brand direction" })
    .click();
  await page
    .getByRole("textbox", { name: "Card title" })
    .fill("Review product direction");
  await page
    .getByRole("textbox", { name: "Details" })
    .fill("Align on the product story.");
  await page.getByRole("button", { name: "Save card" }).click();

  await expect(
    page.getByRole("heading", { name: "Review product direction" }),
  ).toBeVisible();
  await expect(page.getByText("Align on the product story.")).toBeVisible();
});

test("moves a card between columns with drag and drop", async ({ page }) => {
  await openBoard(page);

  const backlog = page.getByRole("region", { name: "Backlog" });
  const upNext = page.getByRole("region", { name: "Up next" });
  const cardTitle = "Review brand direction";
  await backlog
    .getByRole("button", { name: `Move card: ${cardTitle}` })
    .dragTo(upNext, { steps: 10 });

  await expect(upNext.getByText(cardTitle)).toBeVisible();
  await expect(backlog.getByText(cardTitle)).toHaveCount(0);
});

test("reorders cards within a column with drag and drop", async ({ page }) => {
  await openBoard(page);

  const backlog = page.getByRole("region", { name: "Backlog", exact: true });
  const firstCard = backlog.getByRole("button", {
    name: "Move card: Review brand direction",
  });
  const secondCard = backlog.getByRole("button", {
    name: "Move card: Plan customer interviews",
  });
  await firstCard.dragTo(secondCard, { steps: 10 });

  await expect(backlog.getByRole("heading", { level: 3 }).first()).toHaveText(
    "Plan customer interviews",
  );
  await expect(backlog.getByRole("heading", { level: 3 }).nth(1)).toHaveText(
    "Review brand direction",
  );
});

test("shows the dragged card and a clear destination before dropping", async ({
  page,
}) => {
  await openBoard(page);

  const backlog = page.getByRole("region", { name: "Backlog", exact: true });
  const upNext = page.getByRole("region", { name: "Up next", exact: true });
  const handle = backlog.getByRole("button", {
    name: "Move card: Review brand direction",
  });
  const handleBounds = await handle.boundingBox();
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
    page.getByRole("region", {
      name: "Dragging card: Review brand direction",
      exact: true,
    }),
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
  await openBoard(page);

  const backlog = page.getByRole("region", { name: "Backlog", exact: true });
  const cardTitle = "Review brand direction";
  const handle = backlog.getByRole("button", { name: `Move card: ${cardTitle}` });

  await handle.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("region", {
      name: `Dragging card: ${cardTitle}`,
      exact: true,
    }),
  ).toBeVisible();
  await waitForKeyboardSensor(page);
  await page.keyboard.press("Escape");

  await expect(backlog.getByText(cardTitle)).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: `Dragging card: ${cardTitle}`,
      exact: true,
    }),
  ).toHaveCount(0);
});

test("dropping outside the board leaves the card where it started", async ({
  page,
}) => {
  await openBoard(page);

  const backlog = page.getByRole("region", { name: "Backlog", exact: true });
  const cardTitle = "Review brand direction";
  const handle = backlog.getByRole("button", { name: `Move card: ${cardTitle}` });
  const handleBounds = await handle.boundingBox();

  if (!handleBounds) {
    throw new Error("The card handle must be visible.");
  }

  await page.mouse.move(
    handleBounds.x + handleBounds.width / 2,
    handleBounds.y + handleBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handleBounds.x + handleBounds.width / 2 + 12, handleBounds.y + 8);
  await expect(
    page.getByRole("region", { name: `Dragging card: ${cardTitle}`, exact: true }),
  ).toBeVisible();
  await page.mouse.move(20, 20, { steps: 8 });
  await page.mouse.up();

  await expect(backlog.getByText(cardTitle)).toBeVisible();
  await expect(
    page.getByRole("region", { name: `Dragging card: ${cardTitle}`, exact: true }),
  ).toHaveCount(0);
});

test("keeps board changes after reload", async ({ page }) => {
  await openBoard(page);

  await page.getByRole("button", { name: "Rename Backlog column" }).click();
  await page.getByRole("textbox", { name: "Column name" }).fill("Ideas");
  await page.getByRole("textbox", { name: "Column name" }).press("Enter");
  await page.getByRole("button", { name: "Add card to Ideas" }).click();
  await page.getByRole("textbox", { name: "Card title" }).fill("Saved research");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await page.reload();

  await expect(
    page.getByRole("region", { name: "Ideas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Ideas", exact: true }).getByText("Saved research"),
  ).toBeVisible();
});

test("persists board edits through the deployed API after reload", async ({
  page,
}) => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, "Requires the Docker-served API.");
  await openBoard(page, true);

  await page.getByRole("button", { name: "Rename Backlog column" }).click();
  await page.getByRole("textbox", { name: "Column name" }).fill("Ideas for persistence");
  await page.getByRole("textbox", { name: "Column name" }).press("Enter");
  await page.getByRole("button", { name: "Add card to Ideas for persistence" }).click();
  await page.getByRole("textbox", { name: "Card title" }).fill("Part 7 persistence card");
  await page.getByRole("textbox", { name: "Details" }).fill("Created in the browser.");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await page.getByRole("button", { name: "Edit card: Part 7 persistence card" }).click();
  await page.getByRole("textbox", { name: "Card title" }).fill("Persisted API card");
  await page.getByRole("textbox", { name: "Details" }).fill("Saved across reload.");
  await page.getByRole("button", { name: "Save card" }).click();

  const ideas = page.getByRole("region", {
    name: "Ideas for persistence",
    exact: true,
  });
  const inProgress = page.getByRole("region", {
    name: "In progress",
    exact: true,
  });
  await ideas
    .getByRole("button", { name: "Move card: Persisted API card" })
    .dragTo(inProgress, { steps: 10 });
  await expect(inProgress.getByText("Persisted API card")).toBeVisible();

  await page.reload();

  const persistedColumn = page.getByRole("region", {
    name: "In progress",
    exact: true,
  });
  await expect(
    page.getByRole("region", {
      name: "Ideas for persistence",
      exact: true,
    }),
  ).toBeVisible();
  await expect(persistedColumn.getByText("Persisted API card")).toBeVisible();
  await expect(persistedColumn.getByText("Saved across reload.")).toBeVisible();

  await persistedColumn
    .getByRole("button", { name: "Delete card: Persisted API card" })
    .click();
  await page.getByRole("button", {
    name: "Rename Ideas for persistence column",
  }).click();
  await page.getByRole("textbox", { name: "Column name" }).fill("Backlog");
  await page.getByRole("textbox", { name: "Column name" }).press("Enter");
});

test("moves a card between columns with the keyboard", async ({ page }) => {
  await openBoard(page);

  const handle = page.getByRole("button", {
    name: "Move card: Review brand direction",
  });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("region", {
      name: "Dragging card: Review brand direction",
      exact: true,
    }),
  ).toBeVisible();
  await waitForKeyboardSensor(page);
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("region", { name: "Up next", exact: true }).getByText("Drop here"),
  ).toBeVisible();
  await page.keyboard.press("Space");

  await expect(
    page
      .getByRole("region", { name: "Up next", exact: true })
      .getByText("Review brand direction"),
  ).toBeVisible();
});

test("keeps all five columns usable in a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page);

  const board = page.getByRole("region", { name: "Project board" });
  await expect(board.getByRole("region")).toHaveCount(5);
  await expect(board.getByRole("region", { name: "Backlog", exact: true })).toBeVisible();

  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(pageOverflows).toBe(false);
});
