/* Checklist importer: turns a messy CSV / TSV / pasted sheet into Heading > Subheading > Points.
 * Pure functions (no DOM, no network) so they can be tested on their own. */

// ---------- 1. Parse text into rows (auto-detects , ; or tab; handles quotes and newlines in cells)
export function parseDelimited(text) {
  text = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const sample = text.split("\n").slice(0, 20).join("\n");
  const count = ch => (sample.match(new RegExp(ch === "\t" ? "\t" : "\\" + ch, "g")) || []).length;
  const delim = [["\t", count("\t")], [",", count(",")], [";", count(";")], ["|", count("|")]].sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell.trim() === "") { q = true; cell = ""; }
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.replace(/\s+/g, " ").trim()));
}

// ---------- 2. Work out what each column means
const SYN = {
  heading: /^(heading|section|category|department|dept|area|function|team|module|stage|phase|zone|head|main)\b/i,
  subheading: /^(sub[\s_-]?heading|sub[\s_-]?section|sub[\s_-]?category|sub[\s_-]?area|work[\s_-]?stream|group|sub|timeline|milestone|time|when|day|activity group)\b/i,
  point: /^(task|tasks|point|points|item|items|check|checklist|checklist point|activity|activities|description|task description|to ?do|action|details?|deliverable)\b/i,
  assignee: /^(assign|assigned|assignee|owner|responsible|poc|person|lead|who|in[\s-]?charge|resp)/i,
  status: /^(status|done|complete|completed|state|progress|tick|✓)\b/i,
  note: /^(note|notes|remark|remarks|comment|comments)\b/i,
  ignore: /^(s\.?\s?no|sr\.?\s?no|#|no\.?|id|serial|sl\.?\s?no)\.?$/i,
};
export const ROLES = ["heading", "subheading", "point", "assignee", "status", "note", "ignore"];

export function detectHeader(rows) {
  // the first row (within the first 10) where at least 2 cells look like column names
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const hits = rows[i].filter(c => c && Object.values(SYN).some(re => re.test(c))).length;
    if (hits >= 2) return i;
  }
  return -1;
}

export function guessMapping(rows, headerIdx) {
  const width = Math.max(...rows.map(r => r.length), 0);
  const head = headerIdx >= 0 ? rows[headerIdx] : [];
  const body = rows.slice(headerIdx + 1).filter(r => r.some(Boolean));
  const map = [];
  for (let c = 0; c < width; c++) {
    const h = head[c] || "";
    let role = null;
    for (const k of ["ignore", "point", "assignee", "status", "note", "subheading", "heading"]) if (h && SYN[k].test(h)) { role = k; break; }
    map.push(role);
  }
  // no recognisable header: infer from the data itself
  const stats = [...Array(width)].map((_, c) => {
    const vals = body.map(r => r[c] || "").filter(Boolean);
    const avgLen = vals.reduce((t, v) => t + v.length, 0) / (vals.length || 1);
    const distinct = new Set(vals.map(v => v.toLowerCase())).size;
    const numeric = vals.filter(v => /^[\d.\-]+$/.test(v)).length / (vals.length || 1);
    const statusLike = vals.filter(v => /^(done|yes|no|open|pending|blocked|complete|completed|na|n\/a|y|n|✓|x|true|false|in progress)$/i.test(v)).length / (vals.length || 1);
    return { c, filled: vals.length, avgLen, distinct, numeric, statusLike };
  });
  if (!map.includes("point")) {
    // the point column is the one with the longest, most varied text
    const cand = stats.filter(s => map[s.c] == null && s.numeric < 0.5 && s.statusLike < 0.5).sort((a, b) => (b.avgLen * b.distinct) - (a.avgLen * a.distinct))[0];
    if (cand) map[cand.c] = "point";
  }
  stats.forEach(s => {
    if (map[s.c] != null) return;
    if (s.numeric > 0.8) map[s.c] = "ignore";
    else if (s.statusLike > 0.6) map[s.c] = "status";
  });
  // remaining text columns to the LEFT of the point column: broad ones become heading, the next subheading
  const pc = map.indexOf("point");
  const left = stats.filter(s => map[s.c] == null && s.c < pc && s.filled).sort((a, b) => a.distinct - b.distinct);
  if (left[0] && !map.includes("heading")) map[left[0].c] = "heading";
  if (left[1] && !map.includes("subheading")) map[left[1].c] = "subheading";
  // a short-text column to the right with few distinct values looks like people
  const right = stats.filter(s => map[s.c] == null && s.c > pc && s.filled && s.avgLen < 25 && s.distinct <= Math.max(3, s.filled * 0.5));
  if (right[0] && !map.includes("assignee")) map[right[0].c] = "assignee";
  // several grouping columns: the broadest (fewest distinct values) is the heading, the rest join the subheading
  const groups = map.map((r, i) => r === "heading" ? i : -1).filter(i => i >= 0);
  if (groups.length > 1) {
    const strong = i => /^(heading|section|category|department|dept|area|function|team|module|main)\b/i.test(head[i] || "");
    // a column actually named like a section wins; otherwise the leftmost grouping column
    const keep = groups.slice().sort((a, b) => (strong(b) - strong(a)) || (a - b))[0];
    groups.forEach(i => { if (i !== keep) map[i] = "subheading"; });
  }
  return map.map(r => r || "ignore");
}

// ---------- 3. Clean text, status, people
export const cleanText = t => String(t || "")
  .replace(/^\s*(?:\d+(?:\.\d+)*[.)]?\s+|\d+[.)]|\(?[a-zA-Z][.)]\s+|\(?[ivx]+[.)]\s+|[-–—•*·▪●○◦►✓✔☐☑□]\s*)+/i, "")
  .replace(/:$/, "")
  .replace(/\s+/g, " ").trim();
const SMALL = new Set(["and","or","of","the","for","to","in","on","at","a","an","&"]);
export const titleCase = t => /[a-z]/.test(t) ? t : t.toLowerCase().split(" ").map((w, i) => i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const level = t => { const m = String(t || "").trim().match(/^((?:\d+\.)+\d*)/); return m ? m[1].replace(/\.$/, "").split(".").length : 0; };
export function normStatus(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "open";
  if (/^(done|yes|y|complete|completed|closed|finished|✓|✔|x|true|ok|tick)$/.test(s)) return "done";
  if (/block|stuck|hold|issue/.test(s)) return "blocked";
  if (/cancel|n\/?a|not (required|needed)|drop/.test(s)) return "cancelled";
  return "open";
}
const keyName = s => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
export function matchPerson(raw, team) {
  const n = keyName(raw); if (!n) return null;
  const first = keyName(String(raw).trim().split(/[\s,/&]+/)[0]);
  return team.find(t => keyName(t.name) === n)
      || team.find(t => keyName(t.name) === first)
      || team.find(t => first.length >= 3 && keyName(t.name).startsWith(first))
      || team.find(t => n.length >= 3 && n.startsWith(keyName(t.name)) && keyName(t.name).length >= 3)
      || null;
}

// ---------- 4. Build the tree
export function buildTree(rows, headerIdx, mapping, team = []) {
  const col = role => mapping.map((r, i) => r === role ? i : -1).filter(i => i >= 0);
  const H = col("heading"), Sb = col("subheading"), P = col("point"), A = col("assignee"), St = col("status"), N = col("note");
  const join = (r, cols) => cols.map(i => cleanText(r[i])).filter(Boolean).join(" · ");
  const heads = new Map(); const order = [];
  const getHead = t => { const k = t.toLowerCase(); if (!heads.has(k)) { heads.set(k, { title: t, points: [], subs: new Map() }); order.push(k); } return heads.get(k); };
  const getSub = (h, t) => { const k = t.toLowerCase(); if (!h.subs.has(k)) h.subs.set(k, { title: t, points: [] }); return h.subs.get(k); };
  let curH = "", curS = "";
  const warnings = [], unmatched = new Map(); let dupes = 0, skipped = 0, noHead = 0, points = 0;
  const seen = new Set();
  rows.slice(headerIdx + 1).forEach((r, idx) => {
    const filled = r.map((c, i) => [c, i]).filter(([c]) => c);
    if (!filled.length) return;
    let h = join(r, H), s = join(r, Sb), p = join(r, P);
    // a lone title in the point column (grouped sheets): CAPS, "1." / "Section:" = heading, "1.1" = subheading
    if (p && filled.length === 1 && !A.some(i => r[i]) && !St.some(i => r[i])) {
      const raw = filled[0][0].trim(), letters = raw.replace(/[^A-Za-z]/g, "");
      const caps = letters.length >= 3 && letters === letters.toUpperCase();
      const bullet = /^[-–—•*·▪●○◦►✓✔☐☑□]/.test(raw);
      if (!bullet && level(raw) >= 2 && raw.length < 80) { curS = cleanText(raw); return; }
      if (!bullet && (caps || /:$/.test(raw) || (/^\d+[.)]\s+\S/.test(raw) && raw.length < 60 && !/\d+\.\d/.test(raw)))) { curH = titleCase(cleanText(raw)); curS = ""; return; }
    }
    // a row with a single filled cell and no point text = a section title
    if (!p && filled.length === 1) {
      const raw = filled[0][0], t = cleanText(raw);
      if (!t) return;
      if (level(raw) >= 2 || (curH && /^\s*([-–•*·]|[a-z][.)])/i.test(raw))) { curS = t; }
      else { curH = t; curS = ""; }
      return;
    }
    if (!p) { // heading/subheading given but no point: treat as section change
      if (h) { curH = h; curS = s || ""; } else if (s) curS = s;
      skipped += h || s ? 0 : 1; return;
    }
    // fill down blanks from the row above (merged cells, grouped exports)
    if (h) { if (h !== curH) curS = ""; curH = h; } else h = curH;
    if (s) curS = s; else s = curS;
    if (!h) { h = "General"; noHead++; }
    const key = `${h}|${s}|${p}`.toLowerCase();
    if (seen.has(key)) { dupes++; return; } seen.add(key);
    const who = join(r, A), person = who ? matchPerson(who, team) : null;
    if (who && !person) unmatched.set(who, (unmatched.get(who) || 0) + 1);
    const pt = { title: p, status: normStatus(St.map(i => r[i]).find(Boolean)), note: join(r, N) || null, assignee_id: person ? person.id : null, assignee_raw: who || null };
    const head = getHead(h);
    (s ? getSub(head, s).points : head.points).push(pt);
    points++;
  });
  if (noHead) warnings.push(`${noHead} point${noHead > 1 ? "s" : ""} had no heading and were put under "General".`);
  if (dupes) warnings.push(`${dupes} duplicate point${dupes > 1 ? "s" : ""} skipped.`);
  if (unmatched.size) { const n = [...unmatched.values()].reduce((a, b) => a + b, 0);
    warnings.push(`${n} point${n > 1 ? "s have" : " has"} an owner not on the team list: ${[...unmatched.keys()].slice(0, 6).join(", ")}${unmatched.size > 6 ? "…" : ""}`); }
  if (!P.length) warnings.push("No column is set as the checklist point. Pick one below.");
  const tree = order.map(k => { const h = heads.get(k); return { title: h.title, points: h.points, subs: [...h.subs.values()] }; });
  return { tree, points, warnings, unmatched: [...unmatched.keys()] };
}

/** one call: text -> {rows, headerIdx, mapping, ...tree} */
export function analyse(text, team, mappingOverride) {
  const rows = parseDelimited(text);
  const headerIdx = detectHeader(rows);
  const mapping = mappingOverride || guessMapping(rows, headerIdx);
  return { rows, headerIdx, mapping, ...buildTree(rows, headerIdx, mapping, team) };
}
