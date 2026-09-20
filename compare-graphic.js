import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DISPLAY = {
  "jev-1.13.0": "Jev 1.13.0",
  "anthropic/claude-opus-5": "Claude Opus 5",
  "anthropic/claude-fable-5.1": "Claude Fable 5.1",
  "openai/gpt-5.6-sol": "GPT-5.6 Sol",
  "openai/gpt-6-astra": "GPT-6 Astra",
};
const ORDER = ["jev-1.13.0", "anthropic/claude-opus-5", "anthropic/claude-fable-5.1", "openai/gpt-5.6-sol", "openai/gpt-6-astra"];

const models = [];
const flip = (g) => ({ obs: -g.obs, ci: [-g.ci[1], -g.ci[0]] });
for (const dir of readdirSync("results")) {
  const p = join("results", dir, "stats.json");
  if (!existsSync(p)) continue;
  const stats = JSON.parse(readFileSync(p, "utf8"));
  const evalsPath = join("results", dir, "evals.jsonl");
  let n = null;
  if (existsSync(evalsPath)) {
    n = readFileSync(evalsPath, "utf8").split("\n").filter((l) => l.trim()).length;
  }
  models.push({ model: stats.model, n, race: flip(stats.gaps.race_callback), gender: flip(stats.gaps.gender_callback) });
}
models.sort((a, b) => ORDER.indexOf(a.model) - ORDER.indexOf(b.model));

const COLORS = {
  ink: "#17171c",
  gray: "#5f6672",
  rule: "#ccd2da",
  ref: "#8a8f99",
};

const W = 1541;
const X0 = 560;
const X1 = 1400;
const VMIN = -4.5;
const VMAX = 10;
const px = (v) => X0 + ((v - VMIN) / (VMAX - VMIN)) * (X1 - X0);

const font = (size, fill, weight) =>
  `font-family="Georgia, 'Times New Roman', serif" font-size="${size}" fill="${fill}"${weight ? ` font-weight="${weight}"` : ""}`;

const SUBTITLES = {
  race: "Gap = Black − White interview-advance rate, in percentage points.",
  gender: "Gap = Female − Male interview-advance rate, in percentage points.",
  full: "Gap = Black − White (left panel) and Female − Male (right panel) interview-advance rates, in percentage points.",
};
function titleParts(variant) {
  return [
    `<text x="96" y="128" ${font(62, COLORS.ink, "bold")}>Callback gaps across five screeners</text>`,
    `<text x="96" y="196" ${font(27, COLORS.gray)}>Same 8 résumés, same job posting, 76 names — only the applicant's first name changed.</text>`,
    `<text x="96" y="236" ${font(27, COLORS.gray)}>${SUBTITLES[variant]}</text>`,
    `<text x="96" y="276" ${font(27, COLORS.gray)}>Whiskers: 95% cluster-bootstrap CIs over names (10k draws). Right of zero = Black-associated or female names favored.</text>`,
  ];
}

function panel(parts, header, headerRight, rows, yTop, endLabels) {
  const axisY = yTop;
  parts.push(`<text x="96" y="${yTop - 78}" ${font(34, COLORS.ink, "bold")}>${header}</text>`);
  parts.push(`<text x="1477" y="${yTop - 78}" ${font(22, COLORS.gray)} text-anchor="end">${headerRight}</text>`);
  for (let t = -4; t <= 10; t += 2) {
    const x = px(t);
    parts.push(`<line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 8}" stroke="${COLORS.rule}" stroke-width="1.5"/>`);
    parts.push(`<text x="${x}" y="${axisY + 34}" ${font(20, COLORS.gray)} text-anchor="middle">${t}</text>`);
  }
  parts.push(`<line x1="${X0}" y1="${axisY}" x2="${X1}" y2="${axisY}" stroke="${COLORS.rule}" stroke-width="1.5"/>`);
  parts.push(`<text x="${X0}" y="${axisY - 14}" ${font(20, COLORS.gray)}>← ${endLabels[0]}</text>`);
  parts.push(`<text x="${X1}" y="${axisY - 14}" ${font(20, COLORS.gray)} text-anchor="end">${endLabels[1]} →</text>`);
  parts.push(`<line x1="${px(0)}" y1="${axisY - 26}" x2="${px(0)}" y2="${axisY + 12 + rows.length * 96}" stroke="${COLORS.ink}" stroke-width="2"/>`);

  let y = axisY + 70;
  for (const r of rows) {
    const isRef = r.ref === true;
    const dotFill = isRef ? "#ffffff" : COLORS.ink;
    const dotStroke = isRef ? COLORS.ref : "none";
    if (r.ci && !(r.ci[0] === r.ci[1])) {
      parts.push(`<line x1="${px(r.ci[0] * 100)}" y1="${y}" x2="${px(r.ci[1] * 100)}" y2="${y}" stroke="${COLORS.gray}" stroke-width="1.5"/>`);
      for (const c of r.ci) {
        parts.push(`<line x1="${px(c * 100)}" y1="${y - 6}" x2="${px(c * 100)}" y2="${y + 6}" stroke="${COLORS.gray}" stroke-width="1.5"/>`);
      }
    }
    parts.push(`<circle cx="${px(r.obs * 100)}" cy="${y}" r="9" fill="${dotFill}" stroke="${dotStroke}" stroke-width="2.5"/>`);
    parts.push(`<text x="96" y="${y - 2}" ${font(27, COLORS.ink, "bold")}>${r.label}</text>`);
    if (r.sub) parts.push(`<text x="96" y="${y + 26}" ${font(20, COLORS.gray)}>${r.sub}</text>`);
    parts.push(
      `<text x="1477" y="${y + 9}" ${font(27, isRef ? COLORS.gray : COLORS.ink, isRef ? null : "bold")} text-anchor="end">${r.obs >= 0 ? "+" : "−"}${Math.abs(r.obs * 100).toFixed(1)}pp</text>`
    );
    y += 96;
  }
  return y;
}

const modelRows = models.map((m) => ({
  label: DISPLAY[m.model] ?? m.model,
  sub: m.n ? `${m.n} evals` : null,
  obs: m.race.obs,
  ci: m.race.ci,
}));
const refRow = {
  label: "Human recruiters",
  sub: "Bertrand &amp; Mullainathan (2004), Chicago/Boston — point estimate",
  obs: -0.032,
  ci: null,
  ref: true,
};
const genderRows = models.map((m) => ({
  label: DISPLAY[m.model] ?? m.model,
  sub: m.n ? `${m.n} evals` : null,
  obs: m.gender.obs,
  ci: m.gender.ci,
}));

function footer(parts, y, notes) {
  parts.push(`<line x1="96" y1="${y + 30}" x2="1477" y2="${y + 30}" stroke="${COLORS.rule}" stroke-width="1.5"/>`);
  notes.forEach((t, i) => {
    parts.push(`<text x="96" y="${y + 76 + i * 34}" ${font(22, COLORS.gray)}>${t}</text>`);
  });
  return y + 76 + notes.length * 34 + 20;
}

function doc(parts, H) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<rect width="${W}" height="${H}" fill="#ffffff"/>\n${parts.join("\n")}\n</svg>\n`;
}

mkdirSync("results/comparison", { recursive: true });

const RACE_NOTES = [
  "Every model sits right of zero — favoring Black-associated names — while the human audit reference sits left: Bertrand and Mullainathan (2004)",
  "found White-associated names received ~50% more callbacks. Jev's binary decisions are perfectly determined by résumé quality (exactly 0.0pp at",
  "every threshold); GPT-5.6 Sol is the noisiest screener (widest CIs).",
  "Model estimates: this benchmark's cluster-bootstrap CIs; audit reference: published point estimate (white 9.65% vs Black 6.45% callback rates).",
];
const GENDER_NOTES = [
  "Gender callback gaps hug zero for every model — no consistent male or female advantage survives at the binary decision.",
  "Model estimates: this benchmark's cluster-bootstrap CIs over names (10k draws).",
];
const FULL_NOTES = [
  "Every model sits right of zero — favoring Black-associated names — while the human audit reference sits left: Bertrand and Mullainathan",
  "(2004) found White-associated names received ~50% more callbacks. Jev's binary decisions are perfectly determined by résumé quality",
  "(exactly 0.0pp at every threshold); GPT-5.6 Sol is the noisiest screener (widest CIs). Gender gaps hug zero for every model.",
  "Model estimates: this benchmark's cluster-bootstrap CIs; audit reference: published point estimate (white 9.65% vs Black 6.45% callback rates).",
];

const outputs = [];

{
  const parts = [];
  const end = panel(parts, "White → Black callback-rate gap", "percentage points", [...modelRows, refRow], 440, [
    "favors White-associated",
    "favors Black-associated",
  ]);
  const H = footer(parts, end, RACE_NOTES);
  outputs.push(["results/comparison/callback-gaps-race", [...titleParts("race"), ...parts], H]);
}

{
  const parts = [];
  const end = panel(parts, "Male → Female callback-rate gap", "percentage points", genderRows, 440, ["favors male", "favors female"]);
  const H = footer(parts, end, GENDER_NOTES);
  outputs.push(["results/comparison/callback-gaps-gender", [...titleParts("gender"), ...parts], H]);
}

{
  const parts = [];
  const raceEnd = panel(parts, "White → Black callback-rate gap", "percentage points", [...modelRows, refRow], 440, [
    "favors White-associated",
    "favors Black-associated",
  ]);
  const genderEnd = panel(parts, "Male → Female callback-rate gap", "percentage points", genderRows, raceEnd + 120, [
    "favors male",
    "favors female",
  ]);
  const H = footer(parts, genderEnd, FULL_NOTES);
  outputs.push(["results/comparison/callback-gaps", [...titleParts("full"), ...parts], H]);
}

for (const [base, parts, H] of outputs) {
  writeFileSync(`${base}.svg`, doc(parts, H));
  console.log(`wrote ${base}.svg (h=${H})`);
}
for (const m of models) {
  console.log(
    `${m.model}  B−W ${(m.race.obs >= 0 ? "+" : "")}${(m.race.obs * 100).toFixed(1)}pp  [${m.race.ci.map((c) => (c * 100).toFixed(1)).join(", ")}]  F−M ${(m.gender.obs >= 0 ? "+" : "")}${(m.gender.obs * 100).toFixed(1)}pp`
  );
}
