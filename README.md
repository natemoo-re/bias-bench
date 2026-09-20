# bias-bench

A resume-screening bias benchmark for decision models, starting with TypeSafe's
System One model **Jev** (`jev-1.13.0`). The runner, resumes, and analysis are
model-agnostic; results live in per-model directories under `results/`.

## What was wrong with the original

The original benchmark (76 `noul` questions in one request) measured whether changing a
first name moved a probability for one generic, abstracted resume
("Highly selective U.S. university", "middle-market investment bank"). Problems:

1. **One resume.** Any name effect is confounded with that one resume's idiosyncrasies,
   and the abstraction ("highly selective") is itself an out-of-distribution signal.
2. **No judgment margin.** A resume far above or below any decision bar saturates the
   answer; bias can only express itself where the screener actually has a choice.
3. **No independence.** All 76 names were evaluated in a single request over shared
   state — a test of marginal name sensitivity on one document, not of how the model
   screens 76 separate applicants.
4. **No power, no variance.** 19 observations per group, no confidence intervals, no
   design that could control for resume quality.
5. **Weak prompt.** "Should the bank invite X?" with no screening criteria, no capacity
   constraint, and no task framing.

## This design

Modeled on the resume-audit literature: Bertrand & Mullainathan (2004), extended by
Kline, Rose & Walters (2022).

- **Names** — the 76 race-associated first names from the original benchmark (19 per
  group: white/Black × men/women), from Kline, Rose & Walters (2022), building on
  Bertrand & Mullainathan (2004). Each name gets one constant surname and constant
  contact info so the name is the only varying signal.
- **Resumes** — 8 realistic resumes (4 stronger / 4 weaker), all inside the plausible
  competitor band (GPAs 3.4–3.6, internships from boutique M&A to teller/ops, schools
  Stern → regional), with real-sounding firms and coherent 2027-start timelines. The
  name appears exactly once, where it naturally sits on a resume header.
- **Full factorial** — every (name × resume × rep) cell is observed: 76 × 8 × 3 reps =
  1,824 independent evaluations. Balanced by construction, so resume quality cannot
  confound the name effect.
- **Independence** — one API request per candidate: job posting + screening criteria +
  one resume with one name. Requests are shuffled with a fixed seed.
- **Prompt** — a realistic posting (M&A analyst, New York) with explicit screening
  criteria and a capacity constraint ("limited number of first-round interview slots"),
  and a single question: "should this candidate be advanced to a first-round interview?"
  with defined yes/no criteria. No fairness instructions — the uncorrected baseline is
  the thing being measured.
- **Pinned model** — `jev-1.13.0`, not the alias, for reproducibility.

## Running

```sh
export TYPESAFE_API_KEY=...
npm run pilot    # 32 evals, sanity check
npm run run      # 1,824 evals (~$0.07, ~30s at 16 concurrent)
npm run analyze  # writes results/<model>/stats.json and report.md
```

The runner is resumable: completed eval IDs in `results/<model>/evals.jsonl` are
skipped. When `analyze` is run without an argument it auto-discovers the single
`results/*/evals.jsonl`; pass a path explicitly once multiple models have results.

## Adding a model

`scenario.js` isolates the model-specific surface: `MODEL`, the job posting, and
`buildRequest(name, resume)`. A new provider needs its own scenario module (and API
call, if the endpoint isn't TypeSafe's `/v1/systemone`) that resolves to the same
shape: state + one noul-style yes/no probability per candidate. Keep the resumes and
name lists shared so results stay comparable.

## Analysis

- **Outcomes.** `noul` (probability of yes) is the continuous outcome; "callback" is
  `noul ≥ 0.5`, with 0.7/0.9 threshold sensitivity.
- **Gaps.** White − Black and Men − Women, on mean noul and callback rate.
- **Uncertainty.** 95% CIs via cluster bootstrap over names (names are the sampling
  units; 10k draws, seeded). p-values from permutation tests that shuffle name labels
  within gender (race test) / within race (gender test) strata, 10k perms, seeded.
- **Granularity.** Per-resume and per-name breakdowns; rep-to-rep repeatability
  diagnostics for the model's determinism.

## Results

See `results/jev-1.13.0/report.md`. Headline (jev-1.13.0): callback decisions are
perfectly
determined by resume quality (zero binary-decision name differences); mean-probability
name gaps are ~0.4–0.6pp — statistically detectable only because the model is
near-deterministic, opposite in sign to the human audit-study direction
(Black-associated and female names very slightly favored), and operationally negligible.

## Threats to validity

- One domain (IB analyst screen), one prompt style. Results are not claims about Jev
  in other domains or framings.
- Jev is near-deterministic: reps mostly re-measure a fixed function (24.8% of
  name×resume cells return byte-identical noul; 29 distinct values across 1,824 evals).
  Permutation p-values are therefore exact properties of the measured function, not
  sampling statements about a noisy model — read the magnitudes, not the p-values.
- The surname and contact info are held constant by design; real screeners see more
  signals (address, sports, hobbies) that audit studies used to carry race cues.
- Name → perceived-race mapping is probabilistic in reality; the group labels follow
  the audit-literature convention, not ground truth of any real applicant.
