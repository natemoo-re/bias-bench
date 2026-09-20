import { mkdirSync, existsSync, readFileSync, openSync, writeSync } from "node:fs";
import { NAMES, GROUPS } from "./names.js";
import { RESUMES } from "./resumes.js";
import { buildRequest as buildJev, MODEL as JEV_MODEL, QUESTION_ID } from "./scenario.js";
import { buildClaudeMessages, DEFAULT_MODEL as CLAUDE_DEFAULT_MODEL } from "./scenario-claude.js";
import { buildGptMessages } from "./scenario-gpt.js";
import { buildFableMessages } from "./scenario-fable.js";
import { buildAstraMessages } from "./scenario-astra.js";

function resolveChatBuilder(model) {
  if (model.includes("fable")) return buildFableMessages;
  if (model.includes("astra")) return buildAstraMessages;
  if (model.startsWith("openai/")) return buildGptMessages;
  return buildClaudeMessages;
}

const PROVIDERS = {
  jev: {
    url: "https://api.typesafe.ai/v1/systemone",
    keyEnv: "TYPESAFE_API_KEY",
    defaultModel: JEV_MODEL,
    defaultConcurrency: 32,
    defaultReps: 3,
    headers: (key) => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" }),
    build: (name, resume, model) => buildJev(name, resume),
    parse: (json) => ({
      noul: json.answers?.[QUESTION_ID]?.noul,
      model: json.model,
      input_tokens: json.usage?.input_tokens,
      output_tokens: json.usage?.output_tokens,
    }),
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    keyEnv: "OPENROUTER_API_KEY",
    defaultModel: CLAUDE_DEFAULT_MODEL,
    defaultConcurrency: 8,
    defaultReps: 1,
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/natemoo-re/bias-bench",
      "X-Title": "bias-bench",
    }),
    build: (name, resume, model) => {
      const { system, user } = resolveChatBuilder(model)(name, resume);
      return {
        model,
        max_tokens: 2048,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      };
    },
    parse: (json) => {
      const text = json.choices?.[0]?.message?.content ?? "";
      const match = text.match(/\{[\s\S]*\}/) ?? text.match(/\{[\s\S]*/);
      let probability = null;
      let advanced = null;
      if (match) {
        const obj = (() => {
          try {
            return JSON.parse(match[0]);
          } catch {}
          try {
            return JSON.parse(match[0] + "}");
          } catch {}
          return null;
        })();
        if (obj) {
          advanced = obj.advance === true;
          probability = typeof obj.probability === "number" ? obj.probability : null;
        }
      }
      if (typeof probability !== "number") {
        throw new Error(`no probability in response: ${text.slice(0, 200)}`);
      }
      return {
        noul: probability,
        advanced,
        raw: text,
        stop_reason: json.choices?.[0]?.finish_reason,
        model: json.model,
        input_tokens: json.usage?.prompt_tokens,
        output_tokens: json.usage?.completion_tokens,
      };
    },
  },
};

async function resolveModel(provider, wanted) {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error(`openrouter model list failed: HTTP ${res.status}`);
  const { data } = await res.json();
  if (data.some((m) => m.id === wanted)) {
    const chosen = data.find((m) => m.id === wanted);
    return { model: chosen.id, pricing: chosen.pricing };
  }
  const candidates = data
    .filter((m) => new RegExp(`^anthropic/${wanted.replace(/^anthropic\//, "")}`).test(m.id))
    .filter((m) => !m.id.includes(":free") && !m.id.includes(":online"))
    .sort((a, b) => b.created - a.created);
  if (candidates.length === 0) {
    const claudeIds = data.filter((m) => m.id.includes("claude")).map((m) => m.id);
    throw new Error(`model ${wanted} not found on openrouter. Claude models: ${claudeIds.join(", ")}`);
  }
  const chosen = candidates[0];
  if (candidates.length > 1) {
    console.log(`multiple matches for ${wanted}: ${candidates.map((m) => m.id).join(", ")}\nusing ${chosen.id}`);
  }
  return { model: chosen.id, pricing: chosen.pricing };
}

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
  const args = { provider: "jev", model: null, reps: null, concurrency: null, pilot: false, out: null, priceIn: null, priceOut: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--provider") args.provider = argv[++i];
    else if (argv[i] === "--model") args.model = argv[++i];
    else if (argv[i] === "--reps") args.reps = Number(argv[++i]);
    else if (argv[i] === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (argv[i] === "--pilot") args.pilot = true;
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--price-in") args.priceIn = Number(argv[++i]);
    else if (argv[i] === "--price-out") args.priceOut = Number(argv[++i]);
  }
  return args;
}

const args = parseArgs(process.argv);
const provider = PROVIDERS[args.provider];
if (!provider) {
  console.error(`unknown provider: ${args.provider} (expected jev or openrouter)`);
  process.exit(1);
}
let model = args.model ?? provider.defaultModel;
let pricing = null;
if (args.provider === "openrouter") {
  const resolved = await resolveModel(provider, model);
  model = resolved.model;
  pricing = resolved.pricing;
}
const reps = args.reps ?? provider.defaultReps;
const concurrency = args.concurrency ?? provider.defaultConcurrency;
const modelDirName = model.replace(/[^a-zA-Z0-9.-]/g, "__");
const out = args.out ?? `results/${modelDirName}/evals.jsonl`;

const pilotNames = ["Sarah", "Geoffrey", "Latoya", "Darnell"];
const names = args.pilot ? NAMES.filter((n) => pilotNames.includes(n.name)) : NAMES;

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
mkdirSync(`results/${modelDirName}`, { recursive: true });
const done = new Set();
if (existsSync(out)) {
  for (const line of readFileSync(out, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      done.add(JSON.parse(line).id);
    } catch {}
  }
}
const pending = evals.filter((e) => !done.has(e.id));

console.log(
  `${args.pilot ? "PILOT" : "FULL"} run [${args.provider} / ${model}]: ${evals.length} evals (${names.length} names x ${RESUMES.length} resumes x ${reps} rep${reps > 1 ? "s" : ""}), ${done.size} already done, ${pending.length} to run`
);
console.log(`output: ${out}\n`);

const key = process.env[provider.keyEnv];
if (!key) {
  console.error(`${provider.keyEnv} is not set`);
  process.exit(1);
}

const outFd = openSync(out, "a");
let okCount = 0;
let errCount = 0;
let inputTokens = 0;
const startedAt = Date.now();
const priceIn = args.priceIn ?? (args.provider === "jev" ? 0.042 : pricing ? Number(pricing.prompt) * 1e6 : null);
const priceOut = args.priceOut ?? (args.provider === "jev" ? 0 : pricing ? Number(pricing.completion) * 1e6 : null);

function logProgress() {
  const elapsed = (Date.now() - startedAt) / 1000;
  const finished = okCount + errCount;
  const rate = finished / elapsed;
  const eta = pending.length > finished ? Math.round((pending.length - finished) / rate) : 0;
  const cost = priceIn !== null && priceIn !== undefined
    ? ` | $${((inputTokens * priceIn + okCostOut * priceOut) / 1e6).toFixed(4)}`
    : "";
  process.stdout.write(
    `\r${finished}/${pending.length} done | ${errCount} errors | ${(inputTokens / 1e6).toFixed(2)}M in tok${cost} | ${rate.toFixed(1)}/s | eta ${eta}s   `
  );
}

let okCostOut = 0;

async function callProvider(evalItem, attempt = 1) {
  const req = provider.build(evalItem.name, RESUMES.find((r) => r.id === evalItem.resume_id), model);
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(provider.url, {
      method: "POST",
      headers: provider.headers(key),
      body: JSON.stringify(req),
    });
  } catch (err) {
    if (attempt >= 6) throw err;
    const delay = Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 500;
    await new Promise((r) => setTimeout(r, delay));
    return callProvider(evalItem, attempt + 1);
  }

  if (res.status === 429 || res.status === 529 || res.status >= 500) {
    if (attempt >= 6) {
      throw new Error(`HTTP ${res.status} after ${attempt} attempts: ${await res.text()}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 500;
    await res.arrayBuffer();
    await new Promise((r) => setTimeout(r, delay));
    return callProvider(evalItem, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} for ${evalItem.id}: ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  const parsed = provider.parse(json);
  const row = {
    ...evalItem,
    noul: parsed.noul,
    advanced: parsed.advanced,
    raw: parsed.raw,
    model: parsed.model ?? model,
    input_tokens: parsed.input_tokens,
    output_tokens: parsed.output_tokens,
    latency_ms: Date.now() - t0,
    attempt,
  };
  writeSync(outFd, JSON.stringify(row) + "\n");
  okCount++;
  inputTokens += row.input_tokens ?? 0;
  okCostOut += row.output_tokens ?? 0;
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

await runPool(pending, concurrency, callProvider);

console.log(`\n\ndone: ${okCount} ok, ${errCount} failed in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
console.log(`total input tokens: ${inputTokens}`);
if (priceIn !== null && priceIn !== undefined) {
  console.log(`estimated cost: $${((inputTokens * priceIn + okCostOut * priceOut) / 1e6).toFixed(2)} (in $${priceIn}/Mtok, out $${priceOut}/Mtok)`);
} else {
  console.log(`cost: unknown — pass --price-in/--price-out (per Mtok) to estimate`);
}
if (errCount > 0) process.exitCode = 2;
