import { mkdirSync, existsSync, readFileSync, appendFileSync, openSync, writeSync, statSync } from "node:fs";
import { NAMES, GROUPS } from "./names.js";
import { RESUMES } from "./resumes.js";
import { buildRequest, MODEL, QUESTION_ID } from "./scenario.js";

const API_URL = "https://api.typesafe.ai/v1/systemone";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv) {
  const args = { reps: 3, concurrency: 32, pilot: false, out: `results/${MODEL}/evals.jsonl` };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--reps") args.reps = Number(argv[++i]);
    else if (argv[i] === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (argv[i] === "--pilot") args.pilot = true;
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);

const pilotNames = ["Sarah", "Geoffrey", "Latoya", "Darnell"];
const names = args.pilot ? NAMES.filter((n) => pilotNames.includes(n.name)) : NAMES;
const reps = args.pilot ? 1 : args.reps;

const evals = [];
for (let rep = 1; rep <= reps; rep++) {
  for (const resume of RESUMES) {
    for (const { name, group } of names) {
      evals.push({
        id: `rep${rep}_${resume.id}_${name.toLowerCase()}`,
        rep,
        name,
        name_group: group,
        race: GROUPS[group].race,
        gender: GROUPS[group].gender,
        resume_id: resume.id,
        resume_tier: resume.tier,
      });
    }
  }
}

const rand = mulberry32(20260919);
for (let i = evals.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [evals[i], evals[j]] = [evals[j], evals[i]];
}

mkdirSync("results", { recursive: true });
const done = new Set();
if (existsSync(args.out)) {
  for (const line of readFileSync(args.out, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      done.add(JSON.parse(line).id);
    } catch {}
  }
}
const pending = evals.filter((e) => !done.has(e.id));

console.log(
  `${args.pilot ? "PILOT" : "FULL"} run: ${evals.length} evals (${names.length} names x ${RESUMES.length} resumes x ${reps} rep${reps > 1 ? "s" : ""}), ${done.size} already done, ${pending.length} to run`
);
console.log(`output: ${args.out}\n`);

const outFd = openSync(args.out, "a");
const key = process.env.TYPESAFE_API_KEY;
if (!key) {
  console.error("TYPESAFE_API_KEY is not set");
  process.exit(1);
}

let okCount = 0;
let errCount = 0;
let inputTokens = 0;
const startedAt = Date.now();

function logProgress() {
  const elapsed = (Date.now() - startedAt) / 1000;
  const finished = okCount + errCount;
  const rate = finished / elapsed;
  const eta = pending.length > finished ? Math.round((pending.length - finished) / rate) : 0;
  process.stdout.write(
    `\r${finished}/${pending.length} done | ${errCount} errors | ${(inputTokens / 1e6).toFixed(2)}M tok | $${((inputTokens * 0.042) / 1e6).toFixed(4)} | ${rate.toFixed(1)}/s | eta ${eta}s   `
  );
}

async function callTypeSafe(evalItem, attempt = 1) {
  const req = buildRequest(evalItem.name, RESUMES.find((r) => r.id === evalItem.resume_id));
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch (err) {
    if (attempt >= 6) throw err;
    const delay = Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 500;
    await new Promise((r) => setTimeout(r, delay));
    return callTypeSafe(evalItem, attempt + 1);
  }

  if (res.status === 429 || res.status === 529 || res.status >= 500) {
    if (attempt >= 6) {
      throw new Error(`HTTP ${res.status} after ${attempt} attempts: ${await res.text()}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 500;
    await res.arrayBuffer();
    await new Promise((r) => setTimeout(r, delay));
    return callTypeSafe(evalItem, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} for ${evalItem.id}: ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  const answer = json.answers[QUESTION_ID];
  const row = {
    ...evalItem,
    noul: answer.noul,
    model: json.model,
    input_tokens: json.usage?.input_tokens ?? null,
    output_tokens: json.usage?.output_tokens ?? null,
    latency_ms: Date.now() - t0,
    attempt,
  };
  writeSync(outFd, JSON.stringify(row) + "\n");
  okCount++;
  inputTokens += row.input_tokens ?? 0;
  if (okCount % 25 === 0 || okCount + errCount === pending.length) logProgress();
}

async function runPool(items, limit, worker) {
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (err) {
        errCount++;
        console.error(`\nFAILED ${item.id}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
}

await runPool(pending, args.concurrency, callTypeSafe);

console.log(`\n\ndone: ${okCount} ok, ${errCount} failed in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
console.log(`total input tokens: ${inputTokens} (~$${((inputTokens * 0.042) / 1e6).toFixed(4)} at $0.042/Mtok)`);
if (errCount > 0) process.exitCode = 2;
