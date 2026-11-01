export type BoardCard = {
  id: string;
  column_id: string;
  title: string;
  details: string;
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
  columns: BoardColumn[];
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
