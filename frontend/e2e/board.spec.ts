import { expect, test } from "@playwright/test";

test("opens one populated board with five columns", async ({ page }) => {
  await page.goto("/");

  const board = page.getByRole("region", { name: "Project board" });
  await expect(board.getByRole("region")).toHaveCount(5);
  await expect(board.getByText("Review brand direction")).toBeVisible();
});

test("renames a column and adds then deletes a card", async ({ page }) => {
  await page.goto("/");

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

test("moves a card between columns with drag and drop", async ({ page }) => {
  await page.goto("/");

  const backlog = page.getByRole("region", { name: "Backlog" });
  const upNext = page.getByRole("region", { name: "Up next" });
  const cardTitle = "Review brand direction";
  await backlog
    .getByRole("button", { name: `Move card: ${cardTitle}` })
    .dragTo(upNext, { steps: 10 });

  await expect(upNext.getByText(cardTitle)).toBeVisible();
  await expect(backlog.getByText(cardTitle)).toHaveCount(0);
});

test("shows the dragged card and a clear destination before dropping", async ({
  page,
}) => {
  await page.goto("/");

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
  await page.goto("/");

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
  await page.goto("/");

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

test("resets changes after reload", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Rename Backlog column" }).click();
  await page.getByRole("textbox", { name: "Column name" }).fill("Ideas");
  await page.getByRole("textbox", { name: "Column name" }).press("Enter");
  await page.reload();

  await expect(
    page.getByRole("region", { name: "Backlog", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Ideas", exact: true }),
  ).toHaveCount(0);
});

test("moves a card between columns with the keyboard", async ({ page }) => {
  await page.goto("/");

  const handle = page.getByRole("button", {
    name: "Move card: Review brand direction",
  });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("status")).toContainText("card-product-copy");
  await page.keyboard.press("Space");

  await expect(
    page
      .getByRole("region", { name: "Up next", exact: true })
      .getByText("Review brand direction"),
  ).toBeVisible();
});

test("keeps all five columns usable in a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const board = page.getByRole("region", { name: "Project board" });
  await expect(board.getByRole("region")).toHaveCount(5);
  await expect(board.getByRole("region", { name: "Backlog", exact: true })).toBeVisible();

  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(pageOverflows).toBe(false);
});
