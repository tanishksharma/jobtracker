// Shared column config for the tracker table, mapped to the Supabase
// `companies` table columns. Mirrors the V1 tracker.csv layout.

export type ColType = "text" | "cat" | "url" | "date" | "long";

export interface Column {
  key: string; // db column name
  label: string;
  type: ColType;
  chip?: "status" | "priority";
  company?: boolean;
}

export const COLUMNS: Column[] = [
  { key: "company", label: "Company", type: "text", company: true },
  { key: "status", label: "Status", type: "cat", chip: "status" },
  { key: "priority", label: "Priority", type: "cat", chip: "priority" },
  { key: "market", label: "Market", type: "cat" },
  { key: "type", label: "Type", type: "cat" },
  { key: "compensation", label: "Comp", type: "cat" },
  { key: "outlook", label: "Outlook", type: "cat" },
  { key: "size", label: "Size", type: "cat" },
  { key: "updated_at", label: "Edited", type: "date" },
  { key: "website", label: "Website", type: "url" },
  { key: "about", label: "About", type: "long" },
  { key: "how_to_apply", label: "How to apply", type: "long" },
  { key: "contact_details", label: "Contact details", type: "long" },
  { key: "scope_of_ai", label: "Scope of AI", type: "long" },
  { key: "tips", label: "Tips", type: "long" },
  { key: "content", label: "Content", type: "long" },
];

export const COL_BY_KEY: Record<string, Column> = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c]),
);
export const CAT_COLS = COLUMNS.filter((c) => c.type === "cat");
export const TABLE_COLS = COLUMNS.filter((c) => c.type !== "long");
export const DETAIL_COLS = COLUMNS.filter(
  (c) => c.type === "long" || c.type === "url",
);

export const DEFAULT_VISIBLE = new Set([
  "company",
  "status",
  "priority",
  "market",
  "type",
  "compensation",
  "website",
]);

// Custom orderings for sorting + dropdown order. Anything not listed -> alpha.
export const ORDER: Record<string, string[]> = {
  priority: ["High", "Medium", "Low"],
  status: ["Ready", "Reached out", "Not started", "Wrong email/DMs not open"],
  outlook: ["Very positive", "Positive", "Negative", "Very negative"],
  size: ["large", "medium", "small"],
  compensation: ["1cr+", "80LPA", "70LPA", "60LPA", "50LPA"],
};

// All editable db fields (everything the user can set).
export const EDITABLE_KEYS = COLUMNS.filter((c) => c.key !== "updated_at").map(
  (c) => c.key,
);

// Maps a V1 tracker.csv header -> companies column. Used by CSV import.
export const CSV_HEADER_TO_COLUMN: Record<string, string> = {
  Company: "company",
  Status: "status",
  Priority: "priority",
  Market: "market",
  "Company type": "type",
  "Compensation band": "compensation",
  "Company outlook": "outlook",
  "Company size (number of employees)": "size",
  Website: "website",
  "About company": "about",
  "How to apply": "how_to_apply",
  "Contact details": "contact_details",
  "Scope of AI": "scope_of_ai",
  Tips: "tips",
  Content: "content",
};
