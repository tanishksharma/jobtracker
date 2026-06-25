"use client";

import { useMemo, useState, useEffect, useRef, useDeferredValue } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseCSV } from "@/lib/csv";
import {
  COLUMNS,
  COL_BY_KEY,
  CAT_COLS,
  TABLE_COLS,
  DETAIL_COLS,
  DEFAULT_VISIBLE,
  ORDER,
  CSV_HEADER_TO_COLUMN,
  type Column,
} from "@/lib/columns";

export interface Company {
  id: string;
  [key: string]: string | undefined;
}

type Filters = Record<string, Set<string>>;

const supabase = createClient();

function statusClass(v: string) {
  return (
    {
      Ready: "st-ready",
      "Not started": "st-not-started",
      "Reached out": "st-reached-out",
      "Wrong email/DMs not open": "st-wrong",
    }[v] || ""
  );
}
function priorityClass(v: string) {
  return { High: "pr-high", Medium: "pr-medium", Low: "pr-low" }[v] || "";
}

function val(row: Company, key: string) {
  return (row[key] ?? "").toString().trim();
}

function fmtDate(v: string) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TrackerClient({
  initialCompanies,
  userEmail,
}: {
  initialCompanies: Company[];
  userEmail: string;
  editableKeys: string[];
}) {
  const [rows, setRows] = useState<Company[]>(initialCompanies);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<Filters>({});
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState<Set<string>>(new Set(DEFAULT_VISIBLE));
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(
    null,
  );
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [showCols, setShowCols] = useState(false);
  const [msg, setMsg] = useState("");
  const [importing, setImporting] = useState(false);

  // Defer search so filtering 2,000+ rows doesn't block each keystroke.
  const deferredSearch = useDeferredValue(search);
  // Guards against onBlur firing a second commit right after Enter/Escape.
  const justCommitted = useRef(false);

  // Close filter dropdowns on outside click.
  useEffect(() => {
    const close = () => setOpenFilter(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  function flash(text: string, isError = false) {
    setMsg((isError ? "⚠ " : "") + text);
    if (!isError) setTimeout(() => setMsg(""), 2500);
  }

  function optionsFor(key: string) {
    const seen = new Set(rows.map((r) => val(r, key)));
    const opts = [...seen];
    const ord = ORDER[key];
    opts.sort((a, b) => {
      if (ord) {
        const ia = ord.indexOf(a),
          ib = ord.indexOf(b);
        if (ia !== -1 || ib !== -1)
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      }
      if (a === "") return 1;
      if (b === "") return -1;
      return a.localeCompare(b);
    });
    return opts;
  }

  const shownRows = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    let out = rows.filter((r) => {
      for (const [key, set] of Object.entries(filters)) {
        if (set.size && !set.has(val(r, key))) return false;
      }
      if (term) {
        const hay = COLUMNS.map((c) => r[c.key] ?? "")
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    if (sortKey) {
      const ord = ORDER[sortKey];
      const dir = sortDir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const va = val(a, sortKey),
          vb = val(b, sortKey);
        if (!va && !vb) return 0;
        if (!va) return 1;
        if (!vb) return -1;
        let c: number;
        if (ord) c = ord.indexOf(va) - ord.indexOf(vb);
        else if (COL_BY_KEY[sortKey]?.type === "date")
          c = new Date(va).getTime() - new Date(vb).getTime();
        else c = va.localeCompare(vb, undefined, { numeric: true });
        return c * dir;
      });
    }
    return out;
  }, [rows, filters, deferredSearch, sortKey, sortDir]);

  const shownColumns = TABLE_COLS.filter(
    (c) => c.company || visible.has(c.key),
  );

  // ---------- Persistence ----------
  async function persist(id: string, patch: Record<string, string>) {
    const { error } = await supabase
      .from("companies")
      .update(patch)
      .eq("id", id);
    if (error) {
      flash("Save failed — " + error.message, true);
      return false;
    }
    return true;
  }

  function setCell(id: string, key: string, value: string) {
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)),
    );
  }

  async function commitEdit(row: Company, key: string, value: string) {
    setEditing(null);
    if (val(row, key) === value.trim()) return;
    const prev = (row[key] ?? "").toString();
    const prevUpdated = row.updated_at;
    const now = new Date().toISOString();
    setRows((rs) =>
      rs.map((r) =>
        r.id === row.id ? { ...r, [key]: value, updated_at: now } : r,
      ),
    );
    const ok = await persist(row.id, { [key]: value });
    if (!ok) {
      // Roll back so the table never shows an edit the database didn't store.
      setRows((rs) =>
        rs.map((r) =>
          r.id === row.id ? { ...r, [key]: prev, updated_at: prevUpdated } : r,
        ),
      );
    }
  }

  async function addCompany() {
    setFilters({});
    setSearch("");
    setSortKey(null);
    const { data, error } = await supabase
      .from("companies")
      .insert({ company: "", status: "Not started" })
      .select()
      .single();
    if (error || !data) {
      flash("Couldn't add — " + (error?.message ?? "unknown"), true);
      return;
    }
    const row = data as Company;
    setRows((rs) => [row, ...rs]);
    setExpanded((e) => new Set(e).add(row.id));
    setEditing({ id: row.id, key: "company" });
  }

  async function duplicateCompany(row: Company) {
    const copy: Record<string, string> = {};
    for (const c of COLUMNS) {
      if (c.key === "updated_at") continue;
      copy[c.key] = (row[c.key] ?? "").toString();
    }
    copy.company = (copy.company || "").trim() + " (copy)";
    const { data, error } = await supabase
      .from("companies")
      .insert(copy)
      .select()
      .single();
    if (error || !data) {
      flash("Couldn't duplicate — " + (error?.message ?? "unknown"), true);
      return;
    }
    const newRow = data as Company;
    setRows((rs) => {
      const i = rs.findIndex((r) => r.id === row.id);
      const next = [...rs];
      next.splice(i === -1 ? next.length : i + 1, 0, newRow);
      return next;
    });
    setExpanded((e) => new Set(e).add(newRow.id));
  }

  async function deleteCompany(row: Company) {
    const name = val(row, "company") || "this company";
    if (!confirm(`Delete ${name}? This can't be undone.`)) return;
    const index = rows.findIndex((r) => r.id === row.id);
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    const { error } = await supabase.from("companies").delete().eq("id", row.id);
    if (error) {
      flash("Delete failed — " + error.message, true);
      // Restore the row in its original position.
      setRows((rs) => {
        const next = [...rs];
        next.splice(index < 0 ? next.length : index, 0, row);
        return next;
      });
    }
  }

  async function importStarter() {
    if (!confirm("Import your starter company list into this account?")) return;
    setImporting(true);
    try {
      const res = await fetch("/tracker.csv", { cache: "no-store" });
      const grid = parseCSV(await res.text());
      const headers = grid[0];
      const records = grid.slice(1).map((cells) => {
        const o: Record<string, string> = {};
        headers.forEach((h, i) => {
          const col = CSV_HEADER_TO_COLUMN[h];
          if (col) o[col] = cells[i] ?? "";
        });
        return o;
      });
      let count = 0;
      for (let i = 0; i < records.length; i += 500) {
        const batch = records.slice(i, i + 500);
        const { data, error } = await supabase
          .from("companies")
          .insert(batch)
          .select();
        if (error) throw error;
        count += data?.length ?? 0;
        setMsg(`Importing… ${Math.min(i + 500, records.length)}/${records.length}`);
      }
      await refreshFromDb();
      flash(`Imported ${count} companies`);
    } catch (e) {
      flash("Import failed — " + (e as Error).message, true);
      // Re-sync so local state matches whatever actually landed in the DB.
      await refreshFromDb();
    } finally {
      setImporting(false);
    }
  }

  async function refreshFromDb() {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) setRows(data as Company[]);
  }

  function toggleFilterValue(key: string, opt: string, on: boolean) {
    setFilters((f) => {
      const next: Filters = { ...f };
      const set = new Set(next[key] ?? []);
      if (on) set.add(opt);
      else set.delete(opt);
      next[key] = set;
      return next;
    });
  }

  // ---------- Cell rendering ----------
  function renderCellValue(row: Company, col: Column) {
    const v = val(row, col.key);
    if (col.type === "url") {
      if (!v) return null;
      let label = v;
      try {
        label = new URL(v).hostname.replace(/^www\./, "");
      } catch {}
      return (
        <a
          className="link"
          href={v}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </a>
      );
    }
    if (col.chip) {
      if (!v) return <span className="chip chip-empty">—</span>;
      const cls = col.chip === "status" ? statusClass(v) : priorityClass(v);
      return <span className={"chip " + cls}>{v}</span>;
    }
    if (col.type === "date") return fmtDate(v);
    return v;
  }

  function Cell({ row, col }: { row: Company; col: Column }) {
    const isEditing = editing?.id === row.id && editing.key === col.key;
    const editable = col.type === "cat" || col.type === "text";
    const cls =
      "col-" +
      col.type +
      (col.company ? " col-company" : "") +
      (editable ? " editable" : "") +
      (col.type === "cat" ? " categorical" : "");

    if (isEditing && col.type === "cat") {
      const opts = optionsFor(col.key);
      if (!opts.includes("")) opts.unshift("");
      return (
        <td className={cls}>
          <select
            className="cell-select"
            autoFocus
            defaultValue={val(row, col.key)}
            onChange={(e) => commitEdit(row, col.key, e.target.value)}
            onBlur={() => setEditing(null)}
          >
            {opts.map((o) => (
              <option key={o} value={o}>
                {o === "" ? "—" : o}
              </option>
            ))}
          </select>
        </td>
      );
    }
    if (isEditing) {
      return (
        <td className={cls}>
          <input
            className="cell-input"
            autoFocus
            defaultValue={val(row, col.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                justCommitted.current = true;
                commitEdit(row, col.key, e.currentTarget.value);
              } else if (e.key === "Escape") {
                justCommitted.current = true;
                setEditing(null);
              }
            }}
            onBlur={(e) => {
              // Enter/Escape already handled this; don't double-commit on the
              // blur that follows when the input unmounts.
              if (justCommitted.current) {
                justCommitted.current = false;
                return;
              }
              commitEdit(row, col.key, e.currentTarget.value);
            }}
          />
        </td>
      );
    }
    return (
      <td
        className={cls}
        onClick={
          editable ? () => setEditing({ id: row.id, key: col.key }) : undefined
        }
      >
        {renderCellValue(row, col)}
      </td>
    );
  }

  const showImport = rows.length === 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Job Tracker</h1>
          <span className="count">
            {shownRows.length === rows.length
              ? `${rows.length} companies`
              : `${shownRows.length} of ${rows.length}`}
          </span>
        </div>
        <div className="topbar-right">
          {msg && (
            <span className={"status-msg" + (msg.startsWith("⚠") ? " error" : "")}>
              {msg}
            </span>
          )}
          <button className="btn" onClick={addCompany}>
            + Add company
          </button>
          <button className="btn" onClick={() => setShowCols((s) => !s)}>
            Columns
          </button>
          <span className="user-email">{userEmail}</span>
          <form action="/auth/signout" method="post">
            <button className="btn btn-ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {showImport && (
        <div className="import-banner">
          <span>
            Your tracker is empty. Import your starter company list to get going.
          </span>
          <button
            className="btn btn-primary"
            onClick={importStarter}
            disabled={importing}
          >
            {importing ? "Importing…" : "Import starter list"}
          </button>
        </div>
      )}

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search companies, notes, contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filters">
          {CAT_COLS.map((col) => {
            const set = filters[col.key];
            const n = set?.size ?? 0;
            return (
              <div className="filter" key={col.key}>
                <button
                  className={"filter-toggle" + (n ? " active" : "")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenFilter((o) => (o === col.key ? null : col.key));
                  }}
                >
                  {col.label}{" "}
                  {n > 0 && <span className="filter-badge">{n}</span>}
                  <span className="chev">▾</span>
                </button>
                {openFilter === col.key && (
                  <div
                    className="filter-menu"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {optionsFor(col.key).map((opt) => (
                      <label key={opt}>
                        <input
                          type="checkbox"
                          checked={set?.has(opt) ?? false}
                          onChange={(e) =>
                            toggleFilterValue(col.key, opt, e.target.checked)
                          }
                        />
                        <span>{opt === "" ? "(empty)" : opt}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => {
            setFilters({});
            setSearch("");
          }}
        >
          Clear filters
        </button>
      </div>

      {showCols && (
        <div className="columns-panel">
          {TABLE_COLS.filter((c) => !c.company).map((col) => (
            <label key={col.key}>
              <input
                type="checkbox"
                checked={visible.has(col.key)}
                onChange={(e) =>
                  setVisible((vis) => {
                    const next = new Set(vis);
                    if (e.target.checked) next.add(col.key);
                    else next.delete(col.key);
                    return next;
                  })
                }
              />
              <span>{col.label}</span>
            </label>
          ))}
        </div>
      )}

      <main className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="expander" />
              {shownColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => {
                    if (sortKey === col.key)
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    else {
                      setSortKey(col.key);
                      setSortDir("asc");
                    }
                  }}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="arrow">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownRows.map((row) => (
              <RowGroup
                key={row.id}
                row={row}
                cols={shownColumns}
                span={shownColumns.length + 1}
                expanded={expanded.has(row.id)}
                toggle={() =>
                  setExpanded((e) => {
                    const next = new Set(e);
                    next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                    return next;
                  })
                }
                Cell={Cell}
                onDetailChange={(key, value) => {
                  setCell(row.id, key, value);
                }}
                onDetailCommit={(key, value) => commitEdit(row, key, value)}
                onDuplicate={() => duplicateCompany(row)}
                onDelete={() => deleteCompany(row)}
              />
            ))}
          </tbody>
        </table>
        {shownRows.length === 0 && !showImport && (
          <p className="empty">No companies match your filters.</p>
        )}
      </main>
    </div>
  );
}

function RowGroup({
  row,
  cols,
  span,
  expanded,
  toggle,
  Cell,
  onDetailChange,
  onDetailCommit,
  onDuplicate,
  onDelete,
}: {
  row: Company;
  cols: Column[];
  span: number;
  expanded: boolean;
  toggle: () => void;
  Cell: (p: { row: Company; col: Column }) => React.ReactNode;
  onDetailChange: (key: string, value: string) => void;
  onDetailCommit: (key: string, value: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr className="row">
        <td className="expander" onClick={toggle} title="Show details">
          {expanded ? "▾" : "▸"}
        </td>
        {cols.map((col) => (
          <Cell key={col.key} row={row} col={col} />
        ))}
      </tr>
      {expanded && (
        <tr className="detail">
          <td colSpan={span}>
            <div className="detail-inner">
              {DETAIL_COLS.map((col) => (
                <div className="detail-field" key={col.key}>
                  <div className="label">{col.label}</div>
                  {col.type === "url" ? (
                    <input
                      type="url"
                      defaultValue={row[col.key] ?? ""}
                      onChange={(e) => onDetailChange(col.key, e.target.value)}
                      onBlur={(e) => onDetailCommit(col.key, e.target.value)}
                    />
                  ) : (
                    <textarea
                      defaultValue={row[col.key] ?? ""}
                      onChange={(e) => onDetailChange(col.key, e.target.value)}
                      onBlur={(e) => onDetailCommit(col.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="detail-footer">
              <button className="btn btn-ghost" onClick={onDuplicate}>
                Duplicate
              </button>
              <button className="btn btn-danger" onClick={onDelete}>
                Delete company
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
