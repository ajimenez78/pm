import { CalendarDays, Flag } from "lucide-react";
import { PRIORITIES, type BoardCard, type Priority } from "./board-data";

export const PRIORITY_LABELS: Record<Priority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function localIsoDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatDueDate(dueDate: string, today: string): string {
  const [year, month, day] = dueDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const sameYear = dueDate.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export type DueState = "overdue" | "today" | "upcoming";

export function getDueState(card: BoardCard, today: string): DueState | null {
  if (!card.due_date) {
    return null;
  }
  if (card.column_id !== "done" && card.due_date < today) {
    return "overdue";
  }
  return card.due_date === today ? "today" : "upcoming";
}

const DUE_PREFIX: Record<DueState, string> = {
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Due",
};

export function CardBadges({ card }: { card: BoardCard }) {
  const today = localIsoDate();
  const dueState = getDueState(card, today);
  if (card.priority === "none" && !dueState) {
    return null;
  }

  return (
    <div className="card-badges">
      {card.priority !== "none" && (
        <span className={`priority-badge priority-${card.priority}`}>
          <Flag aria-hidden="true" size={11} />
          {PRIORITY_LABELS[card.priority]}
        </span>
      )}
      {card.due_date && dueState && (
        <span className={`due-chip due-${dueState}`}>
          <CalendarDays aria-hidden="true" size={11} />
          {dueState === "today"
            ? DUE_PREFIX.today
            : `${DUE_PREFIX[dueState]} ${formatDueDate(card.due_date, today)}`}
        </span>
      )}
    </div>
  );
}

type CardMetaFieldsProps = {
  idPrefix: string;
  priority: Priority;
  dueDate: string;
  onPriorityChange: (priority: Priority) => void;
  onDueDateChange: (dueDate: string) => void;
};

export function CardMetaFields({
  idPrefix,
  priority,
  dueDate,
  onPriorityChange,
  onDueDateChange,
}: CardMetaFieldsProps) {
  return (
    <div className="card-meta-fields">
      <label htmlFor={`${idPrefix}-priority`}>
        Priority
        <select
          id={`${idPrefix}-priority`}
          onChange={(event) => onPriorityChange(event.target.value as Priority)}
          value={priority}
        >
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {PRIORITY_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${idPrefix}-due`}>
        Due date
        <input
          id={`${idPrefix}-due`}
          onChange={(event) => onDueDateChange(event.target.value)}
          type="date"
          value={dueDate}
        />
      </label>
    </div>
  );
}
