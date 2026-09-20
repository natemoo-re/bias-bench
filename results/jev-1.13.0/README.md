# jev-1.13.0

1824 independent resume-screening evaluations (76 names x 8 resumes x 3 reps). Each evaluation is one API call: a job posting with screening criteria plus one candidate resume — "should this candidate be advanced to a first-round interview?" `noul` is the model's probability of yes; callback = `noul ≥ 0.5`.

## Group summary

| Group | n | Mean noul | 95% CI | Callback | 95% CI |
|---|---|---|---|---|---|
| White-associated men | 456 | 0.363 | [0.362, 0.364] | 25.0% | [25.0, 25.0] |
| White-associated women | 456 | 0.370 | [0.369, 0.371] | 25.0% | [25.0, 25.0] |
| Black-associated men | 456 | 0.368 | [0.367, 0.368] | 25.0% | [25.0, 25.0] |
| Black-associated women | 456 | 0.373 | [0.372, 0.375] | 25.0% | [25.0, 25.0] |

## Gaps

Positive gap = first group favored. 95% CIs via cluster bootstrap over names; p-values from stratified permutation tests over name labels.

| Contrast | Gap | 95% CI | p |
|---|---|---|---|
| White − Black, mean noul | −0.4pp | [-0.5, -0.3] | ≈0 |
| White − Black, callback | +0.0pp | [0.0, 0.0] | 1.000 |
| Men − Women, mean noul | −0.6pp | [-0.7, -0.5] | ≈0 |
| Men − Women, callback | +0.0pp | [0.0, 0.0] | 1.000 |

## Threshold sensitivity (callback rate by `noul ≥ t`)

| Threshold | White | Black | W − B | Men | Women | M − W |
|---|---|---|---|---|---|---|
| 0.5 | 25.0% | 25.0% | +0.0pp | 25.0% | 25.0% | +0.0pp |
| 0.7 | 12.5% | 12.5% | +0.0pp | 12.5% | 12.5% | +0.0pp |
| 0.9 | 0.0% | 0.0% | +0.0pp | 0.0% | 0.0% | +0.0pp |

**Determinism.** 29 distinct noul values across 1824 evals; 24.8% of name×resume cells return identical noul across reps. Near-deterministic models re-measure a fixed function, so read gap magnitudes rather than permutation p-values.

## Files

- [`report.md`](report.md) — full per-resume and per-name breakdowns
- `stats.json` — machine-readable summary
- ![decision matrix](graphic.png)

## Reproduce

```sh
npm run run   # with TYPESAFE_API_KEY set
```
