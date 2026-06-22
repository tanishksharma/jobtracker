"use strict";

/* ----------------------------------------------------------------------
 * Job Tracker — loads tracker.csv, renders an editable table, saves back.
 * No framework, no build step.
 * -------------------------------------------------------------------- */

// Column config. `type`: text | cat (categorical) | url | date | long.
// `long` fields live only in the expandable detail panel.
const COLUMNS = [
  { key: "Company", label: "Company", type: "text", kind: "company" },
  { key: "Status", label: "Status", type: "cat", chip: "status" },
  { key: "Priority", label: "Priority", type: "cat", chip: "priority" },
  { key: "Market", label: "Market", type: "cat" },
  { key: "Company type", label: "Type", type: "cat" },
  { key: "Compensation band", label: "Comp", type: "cat" },
  { key: "Company outlook", label: "Outlook", type: "cat" },
  { key: "Company size (number of employees)", label: "Size", type: "cat" },
  { key: "Last edited time", label: "Edited", type: "date" },
  { key: "Website", label: "Website", type: "url" },
  { key: "About company", label: "About", type: "long" },
  { key: "How to apply", label: "How to apply", type: "long" },
  { key: "Contact details", label: "Contact details", type: "long" },
  { key: "Scope of AI", label: "Scope of AI", type: "long" },
  { key: "Tips", label: "Tips", type: "long" },
  { key: "Content", label: "Content", type: "long" },
];

const COL_BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));
const CAT_COLS = COLUMNS.filter((c) => c.type === "cat");
const TABLE_COLS = COLUMNS.filter((c) => c.type !== "long"); // selectable as columns
const DETAIL_COLS = COLUMNS.filter((c) => c.type === "long" || c.type === "url");

// Custom orderings (for sorting + dropdown order). Anything not listed -> alpha.
const ORDER = {
  "Priority": ["High", "Medium", "Low"],
  "Status": ["Ready", "Reached out", "Not started", "Wrong email/DMs not open"],
  "Company outlook": ["Very positive", "Positive", "Negative", "Very negative"],
  "Company size (number of employees)": ["large", "medium", "small"],
  "Compensation band": ["1cr+", "80LPA", "70LPA", "60LPA", "50LPA"],
};

const DEFAULT_VISIBLE = new Set([
  "Company", "Status", "Priority", "Market", "Company type", "Compensation band", "Website",
]);

// ---------------- State ----------------
const state = {
  headers: [],            // CSV header order (incl. "id")
  rows: [],               // array of objects
  sortKey: null,
  sortDir: "asc",
  filters: {},            // key -> Set of selected values
  search: "",
  expanded: new Set(),    // ids
  visible: new Set(DEFAULT_VISIBLE),
  dirty: false,
};

// ---------------- CSV ----------------
function parseCSV(text) {
  const out = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); out.push(row); row = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return out;
}

function serializeCSV(headers, objs) {
  const esc = (v) => {
    v = v == null ? "" : String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const lines = [headers.map(esc).join(",")];
  for (const o of objs) lines.push(headers.map((h) => esc(o[h])).join(","));
  return lines.join("\r\n") + "\r\n";
}

// ---------------- Load ----------------
async function load() {
  let text;
  try {
    const res = await fetch("tracker.csv", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    text = await res.text();
  } catch (e) {
    document.querySelector(".table-wrap").hidden = true;
    document.querySelector(".toolbar").style.visibility = "hidden";
    document.getElementById("load-error").hidden = false;
    return;
  }
  const grid = parseCSV(text);
  state.headers = grid[0];
  state.rows = grid.slice(1).map((cells) => {
    const o = {};
    state.headers.forEach((h, i) => { o[h] = cells[i] != null ? cells[i] : ""; });
    return o;
  });
  buildColumnsPanel();
  buildFilters();
  render();
}

// ---------------- Derived data ----------------
function optionsFor(key) {
  const seen = new Set(state.rows.map((r) => (r[key] || "").trim()));
  let opts = [...seen];
  const ord = ORDER[key];
  opts.sort((a, b) => {
    if (ord) {
      const ia = ord.indexOf(a), ib = ord.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }
    if (a === "") return 1;
    if (b === "") return -1;
    return a.localeCompare(b);
  });
  return opts;
}

function compare(a, b, col) {
  const va = (a[col.key] || "").trim(), vb = (b[col.key] || "").trim();
  if (!va && !vb) return 0;
  if (!va) return 1;        // empties always last
  if (!vb) return -1;
  const ord = ORDER[col.key];
  if (ord) return ord.indexOf(va) - ord.indexOf(vb);
  if (col.type === "date") return new Date(va) - new Date(vb);
  return va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
}

function visibleRows() {
  const term = state.search.trim().toLowerCase();
  let rows = state.rows.filter((r) => {
    for (const [key, set] of Object.entries(state.filters)) {
      if (set.size && !set.has((r[key] || "").trim())) return false;
    }
    if (term) {
      const hay = state.headers.filter((h) => h !== "id")
        .map((h) => r[h] || "").join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
  if (state.sortKey) {
    const col = COL_BY_KEY[state.sortKey];
    const dir = state.sortDir === "asc" ? 1 : -1;
    rows = rows.slice().sort((a, b) => compare(a, b, col) * dir);
  }
  return rows;
}

// ---------------- Rendering ----------------
function shownColumns() {
  return TABLE_COLS.filter((c) => c.key === "Company" || state.visible.has(c.key));
}

function statusClass(v) {
  return { "Ready": "st-ready", "Not started": "st-not-started",
    "Reached out": "st-reached-out", "Wrong email/DMs not open": "st-wrong" }[v] || "";
}
function priorityClass(v) {
  return { "High": "pr-high", "Medium": "pr-medium", "Low": "pr-low" }[v] || "";
}

function fillCell(td, row, col) {
  td.textContent = "";
  td.className = "col-" + col.type;
  const val = (row[col.key] || "").trim();

  if (col.kind === "company") td.classList.add("col-company");

  if (col.type === "url") {
    if (val) {
      const a = document.createElement("a");
      a.className = "link";
      a.href = val; a.target = "_blank"; a.rel = "noopener";
      try { a.textContent = new URL(val).hostname.replace(/^www\./, ""); }
      catch { a.textContent = val; }
      td.appendChild(a);
    }
    return;
  }

  if (col.chip) {
    if (!val) {
      const s = document.createElement("span");
      s.className = "chip chip-empty"; s.textContent = "—";
      td.appendChild(s);
    } else {
      const s = document.createElement("span");
      const cls = col.chip === "status" ? statusClass(val) : priorityClass(val);
      s.className = "chip " + cls; s.textContent = val;
      td.appendChild(s);
    }
    td.classList.add("editable", "categorical");
    return;
  }

  td.textContent = val;
  if (col.type === "cat") td.classList.add("editable", "categorical");
  else if (col.type === "text") td.classList.add("editable");
}

function render() {
  const cols = shownColumns();

  // header
  const headRow = document.getElementById("head-row");
  headRow.textContent = "";
  headRow.appendChild(document.createElement("th")).className = "expander"; // expander col
  for (const col of cols) {
    const th = document.createElement("th");
    th.textContent = col.label;
    if (state.sortKey === col.key) {
      const a = document.createElement("span");
      a.className = "arrow";
      a.textContent = state.sortDir === "asc" ? "▲" : "▼";
      th.appendChild(a);
    }
    th.addEventListener("click", () => {
      if (state.sortKey === col.key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else { state.sortKey = col.key; state.sortDir = "asc"; }
      render();
    });
    headRow.appendChild(th);
  }

  // body
  const body = document.getElementById("body");
  body.textContent = "";
  const rows = visibleRows();
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = "row";
    tr.dataset.id = row.id;

    const exp = document.createElement("td");
    exp.className = "expander";
    exp.textContent = state.expanded.has(row.id) ? "▾" : "▸";
    exp.title = "Show details";
    exp.addEventListener("click", () => {
      if (state.expanded.has(row.id)) state.expanded.delete(row.id);
      else state.expanded.add(row.id);
      render();
    });
    tr.appendChild(exp);

    for (const col of cols) {
      const td = document.createElement("td");
      td.dataset.key = col.key;
      fillCell(td, row, col);
      if (td.classList.contains("editable")) {
        td.addEventListener("click", () => startEdit(td, row, col));
      }
      tr.appendChild(td);
    }
    body.appendChild(tr);

    if (state.expanded.has(row.id)) {
      body.appendChild(detailRow(row, cols.length + 1));
    }
  }

  document.getElementById("empty").hidden = rows.length !== 0;
  document.getElementById("count").textContent =
    rows.length === state.rows.length
      ? `${state.rows.length} companies`
      : `${rows.length} of ${state.rows.length}`;
}

function detailRow(row, span) {
  const tr = document.createElement("tr");
  tr.className = "detail";
  const td = document.createElement("td");
  td.colSpan = span;
  const wrap = document.createElement("div");
  wrap.className = "detail-inner";

  for (const col of DETAIL_COLS) {
    const field = document.createElement("div");
    field.className = "detail-field";
    const label = document.createElement("div");
    label.className = "label"; label.textContent = col.label;
    field.appendChild(label);

    const editor = col.type === "url"
      ? document.createElement("input")
      : document.createElement("textarea");
    editor.value = row[col.key] || "";
    if (col.type === "url") editor.type = "url";
    editor.addEventListener("change", () => {
      if ((row[col.key] || "") !== editor.value) {
        row[col.key] = editor.value;
        stamp(row);
        setDirty(true);
        refreshRowMeta(row);
      }
    });
    field.appendChild(editor);
    wrap.appendChild(field);
  }
  td.appendChild(wrap);
  tr.appendChild(td);
  return tr;
}

// Update the visible "Last edited time" / Website cells of a row in place.
function refreshRowMeta(row) {
  const tr = document.querySelector(`tr.row[data-id="${row.id}"]`);
  if (!tr) return;
  for (const td of tr.querySelectorAll("td[data-key]")) {
    fillCell(td, row, COL_BY_KEY[td.dataset.key]);
    if (td.classList.contains("editable"))
      td.onclick = () => startEdit(td, row, COL_BY_KEY[td.dataset.key]);
  }
}

// ---------------- Editing ----------------
function stamp(row) {
  if ("Last edited time" in row) {
    row["Last edited time"] = new Date().toLocaleString("en-US", {
      month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }
}

function startEdit(td, row, col) {
  if (td.querySelector("select, input")) return;
  const current = (row[col.key] || "");
  td.textContent = "";

  const commit = (val, doRender) => {
    if (val === current) { fillCell(td, row, col); rebind(td, row, col); return; }
    row[col.key] = val;
    stamp(row);
    setDirty(true);
    if (doRender) render(); else { fillCell(td, row, col); rebind(td, row, col); }
  };

  if (col.type === "cat") {
    const sel = document.createElement("select");
    sel.className = "cell-select";
    const opts = optionsFor(col.key);
    if (!opts.includes("")) opts.unshift("");
    for (const o of opts) {
      const op = document.createElement("option");
      op.value = o; op.textContent = o === "" ? "—" : o;
      if (o === current) op.selected = true;
      sel.appendChild(op);
    }
    td.appendChild(sel);
    sel.focus();
    let done = false;
    sel.addEventListener("change", () => { done = true; commit(sel.value, true); });
    sel.addEventListener("blur", () => { if (!done) { fillCell(td, row, col); rebind(td, row, col); } });
  } else {
    const inp = document.createElement("input");
    inp.className = "cell-input"; inp.value = current;
    td.appendChild(inp); inp.focus(); inp.select();
    let done = false;
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { done = true; commit(inp.value, false); }
      else if (e.key === "Escape") { done = true; fillCell(td, row, col); rebind(td, row, col); }
    });
    inp.addEventListener("blur", () => { if (!done) commit(inp.value, false); });
  }
}

function rebind(td, row, col) {
  if (td.classList.contains("editable"))
    td.onclick = () => startEdit(td, row, col);
}

// ---------------- Filters UI ----------------
function buildFilters() {
  const host = document.getElementById("filters");
  host.textContent = "";
  for (const col of CAT_COLS) {
    state.filters[col.key] = state.filters[col.key] || new Set();
    const wrap = document.createElement("div");
    wrap.className = "filter";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "filter-toggle";
    const refreshToggle = () => {
      const n = state.filters[col.key].size;
      toggle.classList.toggle("active", n > 0);
      toggle.textContent = col.label + " ";
      const chev = document.createElement("span");
      chev.className = "chev"; chev.textContent = "▾";
      if (n) {
        const badge = document.createElement("span");
        badge.className = "filter-badge"; badge.textContent = n;
        toggle.appendChild(badge);
      }
      toggle.appendChild(chev);
    };
    refreshToggle();

    const menu = document.createElement("div");
    menu.className = "filter-menu"; menu.hidden = true;
    for (const opt of optionsFor(col.key)) {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.filters[col.key].has(opt);
      cb.addEventListener("change", () => {
        if (cb.checked) state.filters[col.key].add(opt);
        else state.filters[col.key].delete(opt);
        refreshToggle();
        render();
      });
      const span = document.createElement("span");
      span.textContent = opt === "" ? "(empty)" : opt;
      label.append(cb, span);
      menu.appendChild(label);
    }

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".filter-menu").forEach((m) => { if (m !== menu) m.hidden = true; });
      menu.hidden = !menu.hidden;
    });
    menu.addEventListener("click", (e) => e.stopPropagation());

    wrap.append(toggle, menu);
    host.appendChild(wrap);
  }
}

// ---------------- Columns picker ----------------
function buildColumnsPanel() {
  const panel = document.getElementById("columns-panel");
  panel.textContent = "";
  for (const col of TABLE_COLS) {
    if (col.key === "Company") continue; // always shown
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state.visible.has(col.key);
    cb.addEventListener("change", () => {
      if (cb.checked) state.visible.add(col.key);
      else state.visible.delete(col.key);
      render();
    });
    const span = document.createElement("span");
    span.textContent = col.label;
    label.append(cb, span);
    panel.appendChild(label);
  }
}

// ---------------- Save / export ----------------
function setDirty(d) {
  state.dirty = d;
  const btn = document.getElementById("save-btn");
  btn.disabled = !d;
  btn.textContent = d ? "Save changes" : "Saved";
}

async function save() {
  const csv = serializeCSV(state.headers, state.rows);
  const msg = document.getElementById("status-msg");
  try {
    const res = await fetch("save", { method: "POST", body: csv });
    if (!res.ok) throw new Error(res.status);
    setDirty(false);
    msg.className = "status-msg";
    msg.textContent = "Saved to tracker.csv";
    setTimeout(() => { if (msg.textContent === "Saved to tracker.csv") msg.textContent = ""; }, 2500);
  } catch (e) {
    msg.className = "status-msg error";
    msg.textContent = "Save failed — is the launcher still running?";
  }
}

function exportCSV() {
  const csv = serializeCSV(state.headers, state.rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tracker.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------- Wire up ----------------
function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

document.getElementById("search").addEventListener("input", debounce((e) => {
  state.search = e.target.value; render();
}, 150));

document.getElementById("clear-filters").addEventListener("click", () => {
  for (const k of Object.keys(state.filters)) state.filters[k].clear();
  state.search = "";
  document.getElementById("search").value = "";
  buildFilters();
  render();
});

document.getElementById("columns-btn").addEventListener("click", () => {
  const p = document.getElementById("columns-panel");
  p.hidden = !p.hidden;
});

document.getElementById("save-btn").addEventListener("click", save);
document.getElementById("export-btn").addEventListener("click", exportCSV);

document.addEventListener("click", () => {
  document.querySelectorAll(".filter-menu").forEach((m) => { m.hidden = true; });
});

window.addEventListener("beforeunload", (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ""; }
});

load();
