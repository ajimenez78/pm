export type BoardCard = {
  id: string;
  title: string;
  details: string;
};

export type BoardColumn = {
  id: string;
  title: string;
  cards: BoardCard[];
};

const sampleColumns: BoardColumn[] = [
  {
    id: "backlog",
    title: "Backlog",
    cards: [
      {
        id: "card-brand-audit",
        title: "Review brand direction",
        details: "Align the visual identity with the new product story.",
      },
      {
        id: "card-customer-interviews",
        title: "Plan customer interviews",
        details: "Prepare a short guide for five early-access customers.",
      },
    ],
  },
  {
    id: "up-next",
    title: "Up next",
    cards: [
      {
        id: "card-product-copy",
        title: "Write product page copy",
        details: "Keep the first fold clear, confident, and concise.",
      },
    ],
  },
  {
    id: "in-progress",
    title: "In progress",
    cards: [
      {
        id: "card-onboarding",
        title: "Design onboarding flow",
        details: "Map the first three minutes of the product experience.",
      },
      {
        id: "card-dashboard",
        title: "Build analytics dashboard",
        details: "Bring the key launch metrics together in one view.",
      },
    ],
  },
  {
    id: "in-review",
    title: "In review",
    cards: [
      {
        id: "card-email-sequence",
        title: "Review welcome emails",
        details: "Check tone and links before the first send.",
      },
    ],
  },
  {
    id: "done",
    title: "Done",
    cards: [
      {
        id: "card-launch-brief",
        title: "Finalize launch brief",
        details: "Share the goals, timeline, and owners with the team.",
      },
    ],
  },
];

export function createInitialColumns(): BoardColumn[] {
  return sampleColumns.map((column) => ({
    ...column,
    cards: column.cards.map((card) => ({ ...card })),
  }));
}
