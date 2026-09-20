import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const GROUP_LABELS = {
  wm: "White-associated men",
  wf: "White-associated women",
  bm: "Black-associated men",
  bf: "Black-associated women",
};
const GAP_LABELS = {
  race_mean_noul: "White − Black, mean noul",
  race_callback: "White − Black, callback",
  gender_mean_noul: "Men − Women, mean noul",
  gender_callback: "Men − Women, callback",
};

const pp = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}pp`;
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const fmtP = (p) => (p === 0 ? "≈0" : p.toFixed(3));
const fmtCI = (ci, asPercent) => {
  const f = (v) => (asPercent ? (v * 100).toFixed(1) : v.toFixed(3));
  return `[${f(ci[0])}, ${f(ci[1])}]`;
};

function loadModel(dir) {
  const stats = JSON.parse(readFileSync(join("results", dir, "stats.json"), "utf8"));
  const evalsPath = join("results", dir, "evals.jsonl");
  let distinct = null;
  if (existsSync(evalsPath)) {
    const noulSet = new Set();
    for (const line of readFileSync(evalsPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      noulSet.add(JSON.parse(line).noul);
    }
    distinct = noulSet.size;
  }
  return { dir, stats, distinct };
}

function reproduceCommand(model) {
  return model === "jev-1.13.0"
    ? "npm run run   # with TYPESAFE_API_KEY set"
    : `node run.js --provider openrouter --model ${model}   # with OPENROUTER_API_KEY set`;
}

function card({ dir, stats, distinct }) {
  const lines = [];
  lines.push(`# ${stats.model}`);
  lines.push("");
  lines.push(
    `${stats.n_evals} independent resume-screening evaluations (${stats.design}). Each evaluation is one API call: a job posting with screening criteria plus one candidate resume — "should this candidate be advanced to a first-round interview?" \`noul\` is the model's probability of yes; callback = \`noul ≥ 0.5\`.`
  );
  lines.push("");
  lines.push("## Group summary");
  lines.push("");
  lines.push("| Group | n | Mean noul | 95% CI | Callback | 95% CI |");
  lines.push("|---|---|---|---|---|---|");
  for (const [key, label] of Object.entries(GROUP_LABELS)) {
    const g = stats.groups[key];
    if (!g) continue;
    lines.push(
      `| ${label} | ${g.n} | ${g.mean_noul.toFixed(3)} | ${fmtCI(g.mean_noul_ci)} | ${pct(g.callback_rate)} | ${fmtCI(g.callback_rate_ci, true)} |`
    );
  }
  lines.push("");
  lines.push("## Gaps");
  lines.push("");
  lines.push("Positive gap = first group favored. 95% CIs via cluster bootstrap over names; p-values from stratified permutation tests over name labels.");
  lines.push("");
  lines.push("| Contrast | Gap | 95% CI | p |");
  lines.push("|---|---|---|---|");
  for (const [key, label] of Object.entries(GAP_LABELS)) {
    const g = stats.gaps[key];
    if (!g) continue;
    lines.push(`| ${label} | ${pp(g.obs)} | ${fmtCI(g.ci, true)} | ${fmtP(g.p)} |`);
  }
  lines.push("");
  lines.push("## Threshold sensitivity (callback rate by `noul ≥ t`)");
  lines.push("");
  lines.push("| Threshold | White | Black | W − B | Men | Women | M − W |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const [t, v] of Object.entries(stats.thresholds ?? {})) {
    lines.push(
      `| ${t} | ${pct(v.white)} | ${pct(v.black)} | ${pp(v.black - v.white)} | ${pct(v.male)} | ${pct(v.female)} | ${pp(v.female - v.male)} |`
    );
  }
  lines.push("");
  const det = [];
  if (distinct !== null) det.push(`${distinct} distinct noul values across ${stats.n_evals} evals`);
  const rep = stats.repeatability ?? {};
  if (rep.share_identical_cells !== null && rep.share_identical_cells !== undefined) {
    det.push(`${pct(rep.share_identical_cells)} of name×resume cells return identical noul across reps`);
  } else {
    det.push("single rep — rep-to-rep repeatability not measured");
  }
  lines.push(`**Determinism.** ${det.join("; ")}. Near-deterministic models re-measure a fixed function, so read gap magnitudes rather than permutation p-values.`);
  lines.push("");
  lines.push("## Files");
  lines.push("");
  lines.push("- [`report.md`](report.md) — full per-resume and per-name breakdowns");
  lines.push("- `stats.json` — machine-readable summary");
  lines.push("- ![decision matrix](graphic.png)");
  lines.push("");
  lines.push("## Reproduce");
  lines.push("");
  lines.push("```sh");
  lines.push(reproduceCommand(stats.model));
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

const dirs = readdirSync("results").filter((d) => existsSync(join("results", d, "stats.json")) && !d.startsWith("."));
const models = dirs.map(loadModel);

for (const m of models) {
  writeFileSync(join("results", m.dir, "README.md"), card(m));
  console.log(`wrote results/${m.dir}/README.md`);
}

const row = (m) => {
  const g = m.stats.gaps;
  const name = `[\`${m.stats.model}\`](results/${m.dir}/)`;
  return `| ${name} | ${m.stats.n_evals} | ${pp(g.race_mean_noul.obs)} ${fmtCI(g.race_mean_noul.ci, true)} | ${fmtP(g.race_mean_noul.p)} | ${pp(g.race_callback.obs)} | ${fmtP(g.race_callback.p)} | ${pp(g.gender_mean_noul.obs)} | ${m.distinct} |`;
};
console.log("");
console.log("Cross-model table (paste into root README):");
console.log("");
console.log("| Model | Evals | W−B mean noul | p | W−B callback | p | M−W mean noul | Distinct noul |");
console.log("|---|---|---|---|---|---|---|---|");
for (const m of models.sort((a, b) => (a.stats.model === "jev-1.13.0" ? -1 : b.stats.model === "jev-1.13.0" ? 1 : a.dir.localeCompare(b.dir)))) console.log(row(m));
