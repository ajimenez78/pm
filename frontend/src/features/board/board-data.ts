export const PRIORITIES = ["none", "low", "medium", "high"] as const;

export type Priority = (typeof PRIORITIES)[number];

export type CardFields = {
  title: string;
  details: string;
  priority: Priority;
  due_date: string | null;
};

export type BoardCard = CardFields & {
  id: string;
  column_id: string;
  position: number;
};

export type BoardColumn = {
  id: string;
  title: string;
  position: number;
  cards: BoardCard[];
};

export type BoardData = {
  id: string;
  title: string;
  description: string;
  columns: BoardColumn[];
};

export type BoardSummary = {
  id: string;
  title: string;
  description: string;
  card_count: number;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AIChatResponse = {
  reply: string;
  changed: boolean;
  board: BoardData;
};
