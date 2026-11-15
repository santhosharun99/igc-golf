/* IGC scoring engine — one implementation shared by the admin hub and the player app.
 *
 * Formats (what the leaderboard ranks on)
 *   stroke      Stroke play (medal). Gross or net strokes, lowest wins.
 *   stableford  Points per hole vs (net) par, highest wins. Default table 0/1/2/3/4/5.
 *   modified    Modified Stableford (aggressive table, e.g. -3/-1/0/2/5/8), highest wins.
 *   parbogey    Par/Bogey: each hole +1 win / 0 half / -1 loss vs (net) par, highest wins.
 *
 * Handicap source (how many strokes a player receives)
 *   admin       Playing handicap set by the tournament office (fallback: index x 125/113).
 *   system36    "Super 36 / System 36" same-day handicap: par or better 2 pts, bogey 1, double+ 0;
 *               handicap = 36 - points (scaled to the number of holes). Known only from the card.
 *   peoria      Peoria: over-par total on hidden holes chosen by the admin, scaled to the round.
 *   none        Scratch, nobody receives strokes.
 * then:  allowance % (WHS recommends 95% for individual stroke play/Stableford), and a max cap.
 *
 * Hole score cap (optional): net double bogey (par + 2 + strokes received) or par + N.
 * Tie-break: countback over the final round's last 9/6/3/1 holes, or lower handicap, or shared.
 */

export const FORMAT_DEFAULT = {
  scoring: "stroke",            // stroke | stableford | modified | parbogey
  basis: "net",                 // gross | net
  handicap: "admin",            // admin | system36 | peoria | none
  allowance: 100,               // % of handicap applied
  hcp_max: 36,                  // cap on the handicap used
  max_score: "none",            // none | ndb | parplus
  max_n: 3,                     // for parplus
  points: { albatross: 5, eagle: 4, birdie: 3, par: 2, bogey: 1, double: 0 },
  points_modified: { albatross: 8, eagle: 5, birdie: 2, par: 0, bogey: -1, double: -3 },
  s36: { albatross: 2, eagle: 2, birdie: 2, par: 2, bogey: 1, double: 0 },   // Super 36 points (standard System 36)
  s36_base: 36,                 // handicap = base - points (for 18 holes; halved for 9)
  peoria_holes: [],             // hidden holes for Peoria
  tiebreak: "countback",        // countback | lowhcp | share
  qualifiers: 10,               // top N marked as qualifying
  lb_visibility: "live",        // live | final | hidden  (what players can see)
};

export function normaliseFormat(f, city) {
  const out = { ...FORMAT_DEFAULT, ...(f || {}) };
  out.points = { ...FORMAT_DEFAULT.points, ...((f || {}).points || {}) };
  out.points_modified = { ...FORMAT_DEFAULT.points_modified, ...((f || {}).points_modified || {}) };
  out.s36 = { ...FORMAT_DEFAULT.s36, ...((f || {}).s36 || {}) };
  if (!f || !f.handicap) out.handicap = city && city.handicap_method === "super36" ? "system36" : "admin";
  return out;
}

export const LABELS = {
  scoring: { stroke: "Stroke play", stableford: "Stableford", modified: "Modified Stableford", parbogey: "Par / Bogey" },
  handicap: { admin: "Player handicaps (set number or Super 36 round)", system36: "Super 36 from the game card (legacy)", peoria: "Peoria", none: "Scratch (no handicap)" },
  max_score: { none: "No cap", ndb: "Net double bogey", parplus: "Par + N" },
  tiebreak: { countback: "Countback (last 9, 6, 3, 1)", lowhcp: "Lower handicap wins", share: "Ties shared" },
};

const higherWins = f => f.scoring === "stableford" || f.scoring === "modified" || f.scoring === "parbogey";

/** strokes received on a hole: handicap spread by stroke index across n holes */
export function received(hcp, si, n) {
  if (!hcp) return 0;
  const sign = hcp < 0 ? -1 : 1, a = Math.abs(hcp);
  const base = Math.floor(a / n), extra = a % n;
  // plus handicaps give strokes back starting from the easiest holes
  const gets = sign > 0 ? si <= extra : si > n - extra;
  return sign * (base + (gets ? 1 : 0));
}

function s36Points(strokes, par, t = FORMAT_DEFAULT.s36) {
  const d = strokes - par;
  return d <= -3 ? t.albatross : d === -2 ? t.eagle : d === -1 ? t.birdie : d === 0 ? t.par : d === 1 ? t.bogey : t.double;
}

function pointsFor(diffVsTarget, table) {
  // diffVsTarget = target - strokes  (target = par [+ strokes received when net])
  if (diffVsTarget >= 3) return table.albatross;
  if (diffVsTarget === 2) return table.eagle;
  if (diffVsTarget === 1) return table.birdie;
  if (diffVsTarget === 0) return table.par;
  if (diffVsTarget === -1) return table.bogey;
  return table.double;
}

export function resultName(strokes, par) {
  if (!strokes) return "";
  if (strokes === 1) return "Ace";
  const d = strokes - par;
  return d <= -3 ? "Albatross" : d === -2 ? "Eagle" : d === -1 ? "Birdie" : d === 0 ? "Par" : d === 1 ? "Bogey" : d === 2 ? "Double" : `+${d}`;
}

/**
 * Score one player.
 * holes: [{hole, par, stroke_index}] (only holes in play, sorted)
 * card:  Map("round-hole" -> strokes)
 * player: {playing_handicap, handicap_index}
 */
export function scorePlayer(fmt, holes, rounds, card, player) {
  const n = holes.length, perRound = [];
  let tGross = 0, tPar = 0, tPlayed = 0, tMetric = 0, tHcp = 0, complete = true;
  const baseHcp = player.playing_handicap ?? (player.handicap_index != null ? Math.round(player.handicap_index * 125 / 113) : 0);

  for (let r = 1; r <= rounds; r++) {
    const rows = holes.map(h => ({ h, s: card.get(`${r}-${h.hole}`) }));
    const played = rows.filter(x => x.s);
    // ---- handicap for this round
    let hcp = 0, hcpKnown = true;
    if (fmt.handicap === "admin") hcp = n === 18 ? baseHcp : Math.round(baseHcp * n / 18);
    else if (fmt.handicap === "system36") {
      const pts = played.reduce((t, x) => t + s36Points(x.s, x.h.par, fmt.s36), 0);
      const full = Math.round((fmt.s36_base ?? 36) * n / 18);    // 36 on 18 holes, 18 on 9
      // running estimate while the round is in progress, exact once all holes are in
      hcp = played.length ? Math.round((full * played.length / n - pts) * n / played.length) : 0;
      if (played.length === n) hcp = full - pts;
      if (hcp < 0) hcp = 0;
      hcpKnown = played.length === n;
    } else if (fmt.handicap === "peoria") {
      const ph = holes.filter(h => fmt.peoria_holes.includes(h.hole));
      const got = ph.map(h => ({ h, s: card.get(`${r}-${h.hole}`) })).filter(x => x.s);
      const over = got.reduce((t, x) => t + Math.min(Math.max(x.s - x.h.par, 0), 2), 0); // each Peoria hole capped at double bogey
      hcp = ph.length ? Math.round(over * n / ph.length) : 0;
      hcpKnown = ph.length > 0 && got.length === ph.length;
    }
    if (fmt.handicap !== "none") hcp = Math.round(hcp * (fmt.allowance ?? 100) / 100);
    const cap = fmt.hcp_max != null ? Math.round(fmt.hcp_max * n / 18) : null;
    if (cap != null && hcp > cap) hcp = cap;
    const useNet = fmt.basis === "net" && fmt.handicap !== "none";

    // ---- per hole
    const holesOut = rows.map(({ h, s }) => {
      const rec = useNet ? received(hcp, Math.min(h.stroke_index, n), n) : 0;
      if (!s) return { hole: h.hole, par: h.par, si: h.stroke_index, rec, strokes: null };
      let capped = s;
      if (fmt.max_score === "ndb") capped = Math.min(s, h.par + 2 + Math.max(rec, 0));
      else if (fmt.max_score === "parplus") capped = Math.min(s, h.par + (fmt.max_n || 3));
      const target = h.par + rec;
      let metric;
      if (fmt.scoring === "stroke") metric = capped - rec;                       // net strokes on the hole
      else if (fmt.scoring === "stableford") metric = pointsFor(target - capped, fmt.points);
      else if (fmt.scoring === "modified") metric = pointsFor(target - capped, fmt.points_modified);
      else metric = capped < target ? 1 : capped === target ? 0 : -1;           // par/bogey
      return { hole: h.hole, par: h.par, si: h.stroke_index, rec, strokes: s, capped, metric, s36: s36Points(s, h.par, fmt.s36), result: resultName(s, h.par) };
    });
    const pl = holesOut.filter(x => x.strokes);
    const gross = pl.reduce((t, x) => t + x.strokes, 0);
    const adj = pl.reduce((t, x) => t + x.capped, 0);
    const parPlayed = pl.reduce((t, x) => t + x.par, 0);
    const recPlayed = pl.reduce((t, x) => t + x.rec, 0);
    const metric = fmt.scoring === "stroke" ? adj - recPlayed : pl.reduce((t, x) => t + x.metric, 0);
    perRound.push({ round: r, holes: holesOut, played: pl.length, gross, adj, toPar: adj - parPlayed, netToPar: adj - parPlayed - recPlayed, hcp, hcpKnown, metric });
    tGross += gross; tPar += parPlayed; tPlayed += pl.length; tHcp += hcp;
    tMetric += fmt.scoring === "stroke" ? adj - recPlayed - parPlayed : metric; // stroke ranks on net/gross to par so in-progress cards compare fairly
    if (pl.length < n) complete = false;
  }
  const last = perRound[perRound.length - 1];
  return {
    rounds: perRound, played: tPlayed, total: n * rounds, complete,
    gross: tGross, toPar: perRound.reduce((t, r) => t + r.toPar, 0),
    hcp: tHcp, hcpKnown: perRound.every(r => r.hcpKnown),
    net: complete && fmt.scoring === "stroke" ? perRound.reduce((t, r) => t + r.adj, 0) - (fmt.basis === "net" && fmt.handicap !== "none" ? tHcp : 0) : null,
    metric: tMetric,                                     // what the leaderboard ranks on
    countback: last ? [9, 6, 3, 1].map(k => {             // final round, last k holes
      const tail = last.holes.slice(-Math.min(k, last.holes.length)).filter(x => x.strokes);
      return tail.reduce((t, x) => t + (fmt.scoring === "stroke" ? x.capped - x.rec : x.metric), 0);
    }) : [],
  };
}

/** Rank a whole field. players: [{id, full_name, home_club, playing_handicap, handicap_index, ...}] */
export function leaderboard(fmt, holes, rounds, players, cardsByPlayer) {
  const hi = higherWins(fmt);
  const rows = players.map(p => ({ ...p, sc: scorePlayer(fmt, holes, rounds, cardsByPlayer.get(p.id) || new Map(), p) }));
  const started = rows.filter(r => r.sc.played > 0), notStarted = rows.filter(r => r.sc.played === 0);
  const cmp = (a, b) => {
    let d = hi ? b.sc.metric - a.sc.metric : a.sc.metric - b.sc.metric;
    if (d) return d;
    if (fmt.tiebreak === "countback" && a.sc.complete && b.sc.complete) {
      for (let i = 0; i < 4; i++) { d = hi ? b.sc.countback[i] - a.sc.countback[i] : a.sc.countback[i] - b.sc.countback[i]; if (d) return d; }
    } else if (fmt.tiebreak === "lowhcp") { d = a.sc.hcp - b.sc.hcp; if (d) return d; }
    return 0;
  };
  started.sort((a, b) => cmp(a, b) || b.sc.played - a.sc.played || a.full_name.localeCompare(b.full_name));
  let prev = null;
  started.forEach((r, i) => { r.pos = prev && cmp(prev, r) === 0 ? prev.pos : i + 1; prev = r; });
  started.forEach(r => { r.tie = started.filter(x => x.pos === r.pos).length > 1; });
  notStarted.sort((a, b) => a.full_name.localeCompare(b.full_name)).forEach(r => { r.pos = null; });
  return [...started, ...notStarted];
}

/** How the main number is shown */
export function fmtMetric(fmt, sc) {
  if (!sc.played) return "–";
  if (fmt.scoring === "stroke") { const v = sc.metric; return v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`; }
  if (fmt.scoring === "parbogey") { const v = sc.metric; return v === 0 ? "AS" : v > 0 ? `${v} up` : `${-v} down`; }
  return `${sc.metric} pts`;
}
export const metricLabel = fmt => fmt.scoring === "stroke" ? (fmt.basis === "net" && fmt.handicap !== "none" ? "Net to par" : "To par")
  : fmt.scoring === "parbogey" ? "vs par" : "Points";

/** Plain-English explanation for players */
export function explain(fmt, holesN, rounds) {
  const parts = [];
  const net = fmt.basis === "net" && fmt.handicap !== "none";
  if (fmt.scoring === "stroke") parts.push(`<b>${net ? "Net" : "Gross"} stroke play</b>: every stroke counts${net ? ", minus your handicap" : ""}. Lowest total wins.`);
  if (fmt.scoring === "stableford" || fmt.scoring === "modified") {
    const t = fmt.scoring === "modified" ? fmt.points_modified : fmt.points;
    parts.push(`<b>${LABELS.scoring[fmt.scoring]}</b>${net ? " (net)" : ""}: points on each hole: albatross ${t.albatross}, eagle ${t.eagle}, birdie ${t.birdie}, par ${t.par}, bogey ${t.bogey}, double or worse ${t.double}. Most points wins.`);
  }
  if (fmt.scoring === "parbogey") parts.push(`<b>Par / Bogey</b>: beat ${net ? "net " : ""}par on a hole to win it (+1), match it to halve (0), lose it (−1). Best total wins.`);
  if (fmt.handicap === "system36") { const t = fmt.s36, base = Math.round((fmt.s36_base ?? 36) * holesN / 18);
    parts.push(`<b>Super 36</b>: your handicap is worked out from today's card. Points per hole: albatross ${t.albatross}, eagle ${t.eagle}, birdie ${t.birdie}, par ${t.par}, bogey ${t.bogey}, double or worse ${t.double}. Handicap = ${base} − your points (never below 0).`); }
  if (fmt.handicap === "admin" && net) parts.push(`Your <b>handicap</b> comes from the tournament office: either an approved number, or the result of your <b>Super 36 handicap round</b>${fmt.allowance !== 100 ? ` (${fmt.allowance}% allowance applied)` : ""}. Strokes are given on the holes with the lowest index first.`);
  if (fmt.handicap === "admin") { const t = fmt.s36, base = Math.round((fmt.s36_base ?? 36) * holesN / 18);
    parts.push(`<b>Super 36 handicap round</b> points: albatross ${t.albatross}, eagle ${t.eagle}, birdie ${t.birdie}, par ${t.par}, bogey ${t.bogey}, double or worse ${t.double}. Handicap = ${base} − points.`); }
  if (fmt.handicap === "peoria") parts.push(`<b>Peoria</b>: your handicap comes from your score on ${fmt.peoria_holes.length || "secret"} hidden holes, revealed when play finishes.`);
  if (fmt.max_score === "ndb") parts.push(`Hole scores are capped at <b>net double bogey</b>.`);
  if (fmt.max_score === "parplus") parts.push(`Hole scores are capped at <b>par + ${fmt.max_n}</b>.`);
  parts.push(`${rounds} round${rounds > 1 ? "s" : ""} of ${holesN} holes. Ties: ${LABELS.tiebreak[fmt.tiebreak].toLowerCase()}. Top ${fmt.qualifiers} qualify.`);
  return parts;
}
