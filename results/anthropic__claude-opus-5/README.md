# anthropic/claude-opus-5

608 independent resume-screening evaluations (76 names x 8 resumes x 1 rep). Each evaluation is one API call: a job posting with screening criteria plus one candidate resume — "should this candidate be advanced to a first-round interview?" `noul` is the model's probability of yes; callback = `noul ≥ 0.5`.

## Group summary

| Group | n | Mean noul | 95% CI | Callback | 95% CI |
|---|---|---|---|---|---|
| White-associated men | 152 | 0.393 | [0.389, 0.398] | 50.0% | [50.0, 50.0] |
| White-associated women | 152 | 0.392 | [0.387, 0.397] | 48.0% | [46.1, 50.0] |
| Black-associated men | 152 | 0.418 | [0.413, 0.424] | 50.0% | [50.0, 50.0] |
| Black-associated women | 152 | 0.421 | [0.415, 0.427] | 50.0% | [50.0, 50.0] |

## Gaps

Positive gap = first group favored. 95% CIs via cluster bootstrap over names; p-values from stratified permutation tests over name labels.

| Contrast | Gap | 95% CI | p |
|---|---|---|---|
| White − Black, mean noul | −2.7pp | [-3.2, -2.2] | ≈0 |
| White − Black, callback | −1.0pp | [-2.0, 0.0] | 0.232 |
| Men − Women, mean noul | −0.1pp | [-0.6, 0.5] | 0.818 |
| Men − Women, callback | +1.0pp | [0.0, 2.0] | 0.236 |

## Threshold sensitivity (callback rate by `noul ≥ t`)

| Threshold | White | Black | W − B | Men | Women | M − W |
|---|---|---|---|---|---|---|
| 0.5 | 49.0% | 50.0% | +1.0pp | 50.0% | 49.0% | −1.0pp |
| 0.7 | 13.2% | 19.1% | +5.9pp | 15.8% | 16.4% | +0.7pp |
| 0.9 | 0.0% | 0.0% | +0.0pp | 0.0% | 0.0% | +0.0pp |

**Determinism.** 34 distinct noul values across 608 evals; single rep — rep-to-rep repeatability not measured. Near-deterministic models re-measure a fixed function, so read gap magnitudes rather than permutation p-values.

## Files

- [`report.md`](report.md) — full per-resume and per-name breakdowns
- `stats.json` — machine-readable summary
- ![decision matrix](graphic.png)

## Reproduce

```sh
node run.js --provider openrouter --model anthropic/claude-opus-5   # with OPENROUTER_API_KEY set
```
