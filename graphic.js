import { readFileSync, writeFileSync } from "node:fs";
import { NAMES, GROUPS } from "./names.js";

const modelDir = process.argv[2] ?? "results/jev-1.13.0";
const rows = readFileSync(`${modelDir}/evals.jsonl`, "utf8")
  .trim()
  .split("\n")
  .map(JSON.parse)
  .filter((r) => typeof r.noul === "number");

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const f4 = (x) => x.toFixed(4);

const byName = new Map();
const byGroup = {};
for (const r of rows) {
  if (!byName.has(r.name)) byName.set(r.name, []);
  byName.get(r.name).push(r.noul);
  (byGroup[r.name_group] ??= []).push(r.noul);
}

const gm = Object.fromEntries(Object.entries(byGroup).map(([g, v]) => [g, mean(v)]));
const white = (gm.wm + gm.wf) / 2;
const black = (gm.bm + gm.bf) / 2;
const raceGap = white - black;
const overall = mean(rows.map((r) => r.noul));
const callbackRate = mean(rows.map((r) => (r.noul >= 0.5 ? 1 : 0)));
const nameMeans = [...byName.entries()].map(([n, v]) => ({ name: n, m: mean(v) }));
const minName = nameMeans.reduce((a, b) => (a.m < b.m ? a : b));
const maxName = nameMeans.reduce((a, b) => (a.m > b.m ? a : b));

const groupOfName = new Map(NAMES.map((n) => [n.name, n.group]));
const aboveCounts = { wm: 0, wf: 0, bm: 0, bf: 0 };
for (const { name, m } of nameMeans) if (m > overall) aboveCounts[groupOfName.get(name)]++;
const abovePooled = {
  white: aboveCounts.wm + aboveCounts.wf,
  black: aboveCounts.bm + aboveCounts.bf,
};

const COLORS = {
  wm: "#2159a5",
  wf: "#8fb6e3",
  bm: "#bf571d",
  bf: "#f5b97b",
  ink: "#17171c",
  gray: "#5f6672",
  grid: "#e6e9ee",
  rule: "#ccd2da",
  band: "#eef1f7",
};

const W = 1541;
const H = 2050;
const plotX = 413;
const plotW = 1064;
const plotTop = 312;
const plotBottom = 1392;
const rowH = (plotBottom - plotTop) / 4;
const X_MIN = 0.355;
const X_MAX = 0.38;
const xA = [plotX, 451];
const xB = [461, 1429];
const xC = [1439, plotX + plotW];
const xScale = (v) =>
  v < X_MIN
    ? xA[0] + (v / X_MIN) * (xA[1] - xA[0])
    : v <= X_MAX
      ? xB[0] + ((v - X_MIN) / (X_MAX - X_MIN)) * (xB[1] - xB[0])
      : xC[0] + ((v - X_MAX) / (1 - X_MAX)) * (xC[1] - xC[0]);

const order = ["wm", "wf", "bm", "bf"];
const parts = [];

parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
parts.push(
  `<text x="96" y="128" font-family="Georgia, 'Times New Roman', serif" font-size="62" font-weight="bold" fill="${COLORS.ink}">Jev 1.13.0 résumé-screen test</text>`
);
parts.push(
  `<text x="96" y="196" font-family="Georgia, 'Times New Roman', serif" font-size="27" fill="${COLORS.gray}">Same 8 résumés and job posting for every name. Only the applicant's first name changed.</text>`
);
parts.push(
  `<text x="96" y="236" font-family="Georgia, 'Times New Roman', serif" font-size="27" fill="${COLORS.gray}">76 names, 19 in each race × sex group. Each dot is one name's mean over 24 independent judgments.</text>`
);
parts.push(
  `<text x="96" y="272" font-family="Georgia, 'Times New Roman', serif" font-size="27" fill="${COLORS.gray}">Broken axis: gray margins compress 0–0.355 and 0.38–1.0.</text>`
);

const bandX = xScale(overall);
parts.push(
  `<rect x="${xA[0]}" y="${plotTop}" width="${xA[1] - xA[0]}" height="${plotBottom - plotTop}" fill="#e9ecf1"/>`
);
parts.push(
  `<rect x="${xC[0]}" y="${plotTop}" width="${xC[1] - xC[0]}" height="${plotBottom - plotTop}" fill="#e9ecf1"/>`
);
parts.push(
  `<rect x="${bandX}" y="${plotTop}" width="${xScale(X_MAX) - bandX}" height="${plotBottom - plotTop}" fill="${COLORS.band}"/>`
);
parts.push(
  `<text x="1421" y="296" font-family="Georgia, 'Times New Roman', serif" font-size="27" fill="${COLORS.ink}" text-anchor="end">Above the 76-name average</text>`
);
parts.push(
  `<text x="${xA[0]}" y="${plotBottom + 64}" font-family="Georgia, 'Times New Roman', serif" font-size="20" fill="${COLORS.gray}" text-anchor="middle">0</text>`
);
const barX = xScale(0.5);
parts.push(
  `<line x1="${barX}" y1="${plotTop}" x2="${barX}" y2="${plotBottom}" stroke="#9aa2af" stroke-width="2" stroke-dasharray="6 6"/>`
);
parts.push(
  `<text x="1477" y="${plotBottom + 94}" font-family="Georgia, 'Times New Roman', serif" font-size="20" fill="${COLORS.gray}" text-anchor="end">interview bar (0.50)</text>`
);

for (let v = 0.355; v <= 0.3801; v += 0.005) {
  const x = xScale(v);
  parts.push(`<line x1="${x}" y1="${plotTop}" x2="${x}" y2="${plotBottom}" stroke="${COLORS.grid}" stroke-width="1.5"/>`);
  parts.push(
    `<text x="${x}" y="${plotBottom + 64}" font-family="Georgia, 'Times New Roman', serif" font-size="27" fill="${COLORS.ink}" text-anchor="middle">${v.toFixed(3)}</text>`
  );
}
parts.push(
  `<text x="${plotX + plotW / 2}" y="${plotBottom + 112}" font-family="Georgia, 'Times New Roman', serif" font-size="27" fill="${COLORS.ink}" text-anchor="middle">Résumé-screen score</text>`
);

for (let i = 0; i <= 4; i++) {
  const y = plotTop + i * rowH;
  parts.push(`<line x1="${plotX}" y1="${y}" x2="${xC[1]}" y2="${y}" stroke="${COLORS.rule}" stroke-width="1.5"/>`);
}
const breakAt = (x0) => {
  parts.push(`<line x1="${x0}" y1="${plotBottom + 14}" x2="${x0 + 7}" y2="${plotBottom - 14}" stroke="${COLORS.ink}" stroke-width="2"/>`);
  parts.push(`<line x1="${x0 + 5}" y1="${plotBottom + 14}" x2="${x0 + 12}" y2="${plotBottom - 14}" stroke="${COLORS.ink}" stroke-width="2"/>`);
};
breakAt(450);
breakAt(1428);
parts.push(`<line x1="${plotX}" y1="${plotTop}" x2="${plotX}" y2="${plotBottom}" stroke="${COLORS.rule}" stroke-width="1.5"/>`);

const LABEL_LINES = {
  wm: ["White-associated", "men"],
  wf: ["White-associated", "women"],
  bm: ["Black-associated", "men"],
  bf: ["Black-associated", "women"],
};

order.forEach((g, i) => {
  const rowTop = plotTop + i * rowH;
  const rowCenter = rowTop + rowH / 2;
  const lx = 96;
  parts.push(
    `<text x="${lx}" y="${rowCenter - 26}" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="bold" fill="${COLORS.ink}">${LABEL_LINES[g][0]}</text>`
  );
  parts.push(
    `<text x="${lx}" y="${rowCenter + 10}" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="bold" fill="${COLORS.ink}">${LABEL_LINES[g][1]}</text>`
  );
  parts.push(
    `<text x="${lx}" y="${rowCenter + 48}" font-family="Georgia, 'Times New Roman', serif" font-size="27" fill="${COLORS.gray}">n = 19</text>`
  );

  const names = nameMeans.filter((n) => groupOfName.get(n.name) === g);
  const bins = new Map();
  for (const n of names) {
    const bin = Math.round(n.m * 1000) / 1000;
    if (!bins.has(bin)) bins.set(bin, []);
    bins.get(bin).push(n.m);
  }
  const spacing = 30;
  for (const [bin, vals] of bins) {
    const x = xScale(bin);
    const k = vals.length;
    vals.forEach((_, j) => {
      const y = rowCenter - ((k - 1) / 2) * spacing + j * spacing;
      parts.push(`<circle cx="${x}" cy="${y}" r="11" fill="${COLORS[g]}"/>`);
    });
  }

  parts.push(
    `<path d="M ${xScale(gm[g])} ${rowTop + rowH - 10} L ${xScale(gm[g]) - 9} ${rowTop + rowH + 7} L ${xScale(gm[g]) + 9} ${rowTop + rowH + 7} Z" fill="${COLORS[g]}"/>`
  );
  parts.push(
    `<text x="${xScale(gm[g]) + 18}" y="${rowTop + rowH + 30}" font-family="Georgia, 'Times New Roman', serif" font-size="27" font-weight="bold" fill="${COLORS[g]}">mean ${f4(gm[g])}</text>`
  );

  parts.push(
    `<text x="1421" y="${rowTop + 52}" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="bold" fill="${COLORS[g]}" text-anchor="end">${aboveCounts[g]} of 19</text>`
  );
});

parts.push(`<line x1="96" y1="1536" x2="1477" y2="1536" stroke="${COLORS.rule}" stroke-width="1.5"/>`);
parts.push(
  `<text x="96" y="1608" font-family="Georgia, 'Times New Roman', serif" font-size="40" font-weight="bold" fill="${COLORS.ink}">Results</text>`
);
parts.push(
  `<text x="690" y="1582" font-family="Georgia, 'Times New Roman', serif" font-size="22" fill="${COLORS.gray}" text-anchor="end">mean score</text>`
);

const legendRows = [
  { dots: [COLORS.wm, COLORS.wf], label: "White-associated names (n = 38)", value: white, y: 1662 },
  { dots: [COLORS.bm, COLORS.bf], label: "Black-associated names (n = 38)", value: black, y: 1722 },
];
for (const r of legendRows) {
  parts.push(`<circle cx="106" cy="${r.y - 9}" r="10" fill="${r.dots[0]}"/>`);
  parts.push(`<circle cx="130" cy="${r.y - 9}" r="10" fill="${r.dots[1]}"/>`);
  parts.push(
    `<text x="154" y="${r.y}" font-family="Georgia, 'Times New Roman', serif" font-size="27" fill="${COLORS.ink}">${r.label}</text>`
  );
  parts.push(
    `<text x="690" y="${r.y}" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="bold" fill="${COLORS.ink}" text-anchor="end">${f4(r.value)}</text>`
  );
}
parts.push(`<line x1="96" y1="1758" x2="690" y2="1758" stroke="${COLORS.rule}" stroke-width="1.5"/>`);
parts.push(
  `<text x="96" y="1814" font-family="Georgia, 'Times New Roman', serif" font-size="27" fill="${COLORS.ink}">Gap</text>`
);
parts.push(
  `<text x="690" y="1814" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="bold" fill="${COLORS.ink}" text-anchor="end">−${f4(Math.abs(raceGap))}</text>`
);

parts.push(`<line x1="780" y1="1576" x2="780" y2="1846" stroke="${COLORS.rule}" stroke-width="1.5"/>`);

parts.push(
  `<text x="820" y="1668" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="${COLORS.ink}"><tspan font-weight="bold" fill="${COLORS.wm}">${abovePooled.white} of 38</tspan> White-associated names</text>`
);
parts.push(
  `<text x="820" y="1712" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="${COLORS.ink}">scored above the 76-name average.</text>`
);
parts.push(
  `<text x="820" y="1796" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="${COLORS.ink}"><tspan font-weight="bold" fill="${COLORS.bm}">${abovePooled.black} of 38</tspan> Black-associated names did.</text>`
);

parts.push(`<line x1="96" y1="1876" x2="1477" y2="1876" stroke="${COLORS.rule}" stroke-width="1.5"/>`);
const notes = [
  `Per-name means span ${f4(minName.m)}–${f4(maxName.m)} (spread ${(maxName.m - minName.m).toFixed(4)}). The White − Black gap is ${raceGap < 0 ? "−" : "+"}${f4(Math.abs(raceGap))} — the opposite direction of the original`,
  `single-résumé test, which reported a +0.0189 gap favoring White-associated names.`,
  `Binary interview decisions showed no name differences: exactly ${(callbackRate * 100).toFixed(1)}% of candidates advanced in every group.`,
  `Names from established résumé-audit research (Kline, Rose and Walters, building on Bertrand and Mullainathan).`,
];
notes.forEach((t, i) => {
  parts.push(
    `<text x="96" y="${1918 + i * 34}" font-family="Georgia, 'Times New Roman', serif" font-size="22" fill="${COLORS.gray}">${t}</text>`
  );
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${parts.join("\n")}\n</svg>\n`;
writeFileSync(`${modelDir}/graphic.svg`, svg);
console.log(`wrote ${modelDir}/graphic.svg`);
console.log(
  JSON.stringify({ groupMeans: gm, white, black, raceGap, overall, aboveCounts, abovePooled, callbackRate, min: minName, max: maxName }, null, 2)
);
