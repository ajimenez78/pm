import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBoard } from "./use-board";

describe("useBoard", () => {
  it("starts with five columns and sample cards containing only title and details", () => {
    const { result } = renderHook(() => useBoard());

    expect(result.current.columns).toHaveLength(5);
    expect(result.current.columns.some((column) => column.cards.length > 0)).toBe(
      true,
    );
    expect(
      Object.keys(result.current.columns[0].cards[0]).sort(),
    ).toEqual(["details", "id", "title"]);
  });

  it("renames a column without changing the number of columns", () => {
    const { result } = renderHook(() => useBoard());

    act(() => result.current.renameColumn(result.current.columns[0].id, "Ideas"));

    expect(result.current.columns[0].title).toBe("Ideas");
    expect(result.current.columns).toHaveLength(5);
  });

  it("adds a card to the requested column", () => {
    const { result } = renderHook(() => useBoard());
    const columnId = result.current.columns[0].id;

    act(() => result.current.addCard(columnId, "Research", "Review the market"));

    expect(result.current.columns[0].cards.at(-1)).toMatchObject({
      title: "Research",
      details: "Review the market",
    });
  });

  it("deletes the selected card", () => {
    const { result } = renderHook(() => useBoard());
    const column = result.current.columns[0];
    const cardId = column.cards[0].id;

    act(() => result.current.deleteCard(cardId));

    expect(result.current.columns[0].cards).not.toContainEqual(
      expect.objectContaining({ id: cardId }),
    );
  });

  it("moves a card to another column without duplicating it", () => {
    const { result } = renderHook(() => useBoard());
    const [source, destination] = result.current.columns;
    const card = source.cards[0];

    act(() => result.current.moveCard(card.id, destination.id));

    expect(result.current.columns[0].cards).not.toContainEqual(
      expect.objectContaining({ id: card.id }),
    );
    expect(result.current.columns[1].cards).toContainEqual(card);
  });

  it("keeps a card in place when moved to its current column", () => {
    const { result } = renderHook(() => useBoard());
    const source = result.current.columns[0];
    const originalCards = source.cards;

    act(() => result.current.moveCard(source.cards[0].id, source.id));

    expect(result.current.columns[0].cards).toBe(originalCards);
  });
});
