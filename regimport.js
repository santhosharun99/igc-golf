/* Registration importer: Google Forms / Sheets export (CSV or Excel) -> participants for one event.
 * Pure functions, testable on their own. */
import { parseDelimited } from "./ckimport.js";

export const FIELDS = {
  registered_at: "Registered at",
  full_name: "Full name",
  email: "Email",
  mobile: "Phone",
  handicap_index: "Handicap",
  tshirt_size: "T-shirt size",
  category: "Category",
  payment_status: "Payment",
  accommodation: "Accommodation",
  airport_transfer: "Airport transfer",
  home_club: "Home club",
  ignore: "Ignore",
};

// match on the question text, so renamed/reordered form questions still work
const SYN = [
  ["registered_at", /^(timestamp|time ?stamp|submitted|submission|date|registered)/i],
  ["email", /e-?mail/i],
  ["mobile", /(phone|mobile|contact|whats ?app|cell)/i],
  ["full_name", /(full ?name|^name$|player name|participant name|your name|golfer name)/i],
  ["handicap_index", /(handicap|hcp|index)/i],
  ["tshirt_size", /(t\s*-?\s*shirt|tee shirt|shirt size|size)/i],
  ["category", /(category|participation|type|delegate|civilian)/i],
  ["payment_status", /(payment|paid|scanner|transaction|utr|fee)/i],
  ["accommodation", /(accommodation|hotel|stay|room)/i],
  ["airport_transfer", /(airport|transfer|pick ?up|cab)/i],
  ["home_club", /(club|home course|course)/i],
];

export function guessFields(header) {
  const used = new Set();
  return header.map(h => {
    const hit = SYN.find(([k, re]) => !used.has(k) && re.test(h || ""));
    if (hit) { used.add(hit[0]); return hit[0]; }
    return "ignore";
  });
}

export const normEmail = e => { const s = String(e || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : (s ? null : ""); };
export function normPhone(p) {
  let d = String(p || "").replace(/[^\d+]/g, "");
  if (!d) return "";
  if (d.startsWith("+")) return d.length >= 11 ? d : null;
  d = d.replace(/^0+/, "");
  if (d.length === 10) return "+91" + d;
  if (d.length === 12 && d.startsWith("91")) return "+" + d;
  return d.length >= 8 ? d : null;
}
export function normHandicap(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s || /^(na|n\/a|none|no|nil|-|new|beginner|not sure|dont know|don't know)$/.test(s)) return null;
  const m = s.replace(",", ".").match(/[+-]?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return n >= -10 && n <= 54 ? Math.round(n * 10) / 10 : null;
}
export function yesNo(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return null;
  if (/^(yes|y|done|paid|initiated|confirmed|true|ok|completed?)/.test(s)) return "Yes";
  if (/^(no|n|not|false|later|pending)/.test(s)) return "No";
  return String(v).trim();       // e.g. "Yes - 2 nights": keep their words
}
export const normSize = v => { const s = String(v || "").trim().toUpperCase().replace(/\s+/g, ""); const m = s.match(/^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|XXXL|4XL)$/); return m ? m[1].replace("2XL", "XXL").replace("XXXL", "3XL") : String(v || "").trim() || null; };
const titleName = n => String(n || "").trim().replace(/\s+/g, " ").replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b([A-Z])([A-Z]+)\b/g, (w, a, b) => w.length > 3 ? a + b.toLowerCase() : w);
function parseTime(v) {
  const s = String(v || "").trim(); if (!s) return null;
  // Google Forms exports like 18/11/2026 09:41:12 (India) or 11/18/2026 9:41:12
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) { let [, a, b, y, H, M, S] = m; let d = +a, mo = +b; if (mo > 12) [d, mo] = [mo, d]; return new Date(+y, mo - 1, d, +H, +M, +(S || 0)).toISOString(); }
  const t = Date.parse(s); return isNaN(t) ? null : new Date(t).toISOString();
}

/** text -> { header, mapping, people[], issues, dupesInFile } ; existing = participants already in the event */
export function analyseRegs(text, existing = [], mappingOverride) {
  const rows = parseDelimited(text).filter(r => r.some(Boolean));
  if (!rows.length) return { header: [], mapping: [], people: [], issues: ["The file is empty."] };
  const header = rows[0];
  const mapping = mappingOverride || guessFields(header);
  const col = k => mapping.indexOf(k);
  const get = (r, k) => { const i = col(k); return i >= 0 ? r[i] : ""; };
  const byKey = new Map(); let dupesInFile = 0;
  const out = [];
  rows.slice(1).forEach((r, idx) => {
    const p = {
      line: idx + 2,
      full_name: titleName(get(r, "full_name")),
      email: normEmail(get(r, "email")),
      mobile: normPhone(get(r, "mobile")),
      handicap_index: normHandicap(get(r, "handicap_index")),
      handicap_raw: get(r, "handicap_index"),
      tshirt_size: normSize(get(r, "tshirt_size")),
      category: get(r, "category") || null,
      payment_status: yesNo(get(r, "payment_status")),
      accommodation: yesNo(get(r, "accommodation")),
      airport_transfer: yesNo(get(r, "airport_transfer")),
      home_club: get(r, "home_club") || null,
      registered_at: parseTime(get(r, "registered_at")),
      problems: [],
    };
    if (!p.full_name) p.problems.push("no name");
    if (p.email === null) p.problems.push("email looks wrong");
    if (p.mobile === null) p.problems.push("phone looks wrong");
    if (!p.email && !p.mobile) p.problems.push("no email or phone");
    if (!p.full_name && !p.email && !p.mobile) return;           // blank row
    // the same person submitting twice: keep the latest submission
    const key = p.email || p.mobile || p.full_name.toLowerCase();
    if (byKey.has(key)) { dupesInFile++; const prev = byKey.get(key); if ((p.registered_at || "") >= (prev.registered_at || "")) { Object.assign(prev, p, { resubmitted: true }); } return; }
    byKey.set(key, p); out.push(p);
  });
  // already registered on the site?
  const exE = new Map(existing.filter(e => e.email).map(e => [String(e.email).toLowerCase(), e]));
  const exM = new Map(existing.filter(e => e.mobile).map(e => [normPhone(e.mobile), e]));
  out.forEach(p => { const e = (p.email && exE.get(p.email)) || (p.mobile && exM.get(p.mobile)); if (e) p.existing_id = e.id; });
  const issues = [];
  if (col("full_name") < 0) issues.push("No column is set as Full name.");
  if (col("email") < 0 && col("mobile") < 0) issues.push("Set an Email or Phone column so people can be matched and log in.");
  return { header, mapping, people: out, dupesInFile, issues };
}
