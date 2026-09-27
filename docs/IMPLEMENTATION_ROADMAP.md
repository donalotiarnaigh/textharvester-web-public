# TextHarvester Research Issues — Implementation Roadmap

Analysis and recommended sequencing of 6 research issues ready for immediate implementation.

**Date**: 2026-04-08

---

## The 6 Issues

| # | Technique | E | I | Status |
|---|-----------|---|---|--------|
| #216 | Extended cross-field validation (date arithmetic, age plausibility) | 2 | 3 | ✅ COMPLETED — PR pending, merged 2026-04-07 |
| #213 | Degenerate output detection (CCR, entropy, length ratio) | 2 | 3 | ✅ COMPLETED — PR pending, implemented 2026-04-08 |
| #215 | Historical date format parsing (Latin months, Old Style/New Style) | 2 | 3 | ✅ COMPLETED — PR #226, merged 2026-04-07 |
| #222 | Prompt caching (Anthropic cache_control, OpenAI cached_tokens) | 2 | 3 | ✅ COMPLETED — PR #230, merged 2026-04-08 |
| #206 | Schema-constrained generation across all providers | 3 | 4 | ✅ COMPLETED — PR #229, merged 2026-04-08 |
| #219 | Active learning loop with disagreement scoring | 3 | 3 |

*E = Effort (1–5), I = Impact (1–5)*

---

## Interactions & Dependencies

### Direct dependencies

**#215 → #216**: Issue #216's own risks section explicitly states "implement #215 first or leave a TODO" — the date validation rules in #216 need to parse raw date strings, and #215's `historicalDateParser.js` provides exactly that. Implementing #215 first avoids duplicate regex logic.

**#216, #213 → #219**: The active learning disagreement score (#219) is computed from `confidenceScores` and `validationWarnings`. The more validation rules feeding that pipeline (#216 adds date checks, #213 adds degenerate output flags), the richer the disagreement signal. #219 benefits from both being in place first.

### Provider-layer conflicts

**#222 vs #206**: Both modify all three provider files. Critically, #206 restructures Anthropic from `messages.create` with plain `system` string to **tool-use** (`tools` + `tool_choice`). This changes how Anthropic's `cache_control` would be applied — #222 plans to add `cache_control` to the `system` content block, but #206 eliminates the plain system string.

**Resolution**: Implement #206 first, then #222 adapts caching to the tool-use structure. This is cleaner because the tool definition (which includes the schema) is static and larger than the system prompt alone — making it a *better* caching target anyway.

### Shared infrastructure (no conflict, but synergy)

- **#213 and #216** both push warnings into the existing `applyValidationWarnings()` pipeline. They're independent (different detection domains — structural vs. semantic) and can be implemented in either order, but together they significantly strengthen the `needs_review` signal.
- **#206 reduces marginal value of #213's length-ratio check**: Schema-constrained generation eliminates most parse errors, so degenerate outputs that slip through will be structurally valid. However, CCR and entropy checks remain valuable since they catch *semantically* degenerate content that schema constraints can't prevent.
- **#222's cost savings compound with #206**: Schema-constrained generation may increase system prompt size (schema included), making prompt caching more valuable — and may push OpenAI prompts above the 1024-token caching threshold.

### Fully independent

- **#215** (date parsing) is a self-contained utility module with no provider-layer changes. Independent of all provider-touching issues (#206, #222).
- **#213** (degenerate detection) is also self-contained. Needs `rawResponse` threaded through from providers but doesn't change provider API call structure.

---

## Compatibility

✅ **All 6 are compatible.** No two issues propose contradictory approaches. The only tension is the **implementation order** of #206 and #222 on the Anthropic provider (discussed above), which is a sequencing concern, not a compatibility issue.

---

## Natural Groupings

### Group A: "Validation & Data Quality" (#215, #216, #213)

All three are deterministic, zero-API-cost, post-extraction checks that feed the existing `validation_warnings` / `needs_review` pipeline. They share the same integration pattern, touch similar files, and collectively make the review queue much more useful.

### Group B: "Provider Optimization" (#206, #222)

Both modify the provider layer to reduce cost and improve reliability. #206 (schema constraints) reduces parse errors; #222 (caching) reduces token costs. They should be sequenced together since both touch the same files.

### Group C: "Evaluation & Learning" (#219)

Builds on top of everything else — consumes the confidence scores and validation warnings from Group A, benefits from the cost reductions of Group B (cheaper per-record processing means more records can be processed for annotation), and is the most externally-dependent (community dataset, optional Langfuse).

---

## Recommended Implementation Order

### Phase 1: Validation & Data Quality

```
#215 → #216 → #213
```

**Why first**: Zero risk, zero external dependencies, zero provider changes. Each is a small self-contained module that plugs into proven infrastructure. #215 before #216 because #216 needs date parsing. #213 can be parallel with #216 but sequencing avoids merge conflicts in `processingHelpers.js`.

**Cumulative value**: After Phase 1, the `needs_review` flag catches date inconsistencies, implausible ages, burial-before-death anomalies, and hallucinated outputs — a substantial accuracy improvement with no additional API cost.

**Approximate scope**: ~3 PRs, ~150 lines new code, ~8 hours total.

### Phase 2: Provider Optimization

```
#206 → #222
```

**Why second**: These are the provider-layer changes. #206 first because it restructures the Anthropic provider (tool-use), and #222 must adapt its caching strategy to whatever provider structure exists. #206 is also the highest-impact issue (I:4) and directly reduces retry costs — meaning the cost savings from #222 compound on a lower baseline.

**Why not first**: Provider changes are riskier (they change API call structure) and benefit from having the validation layer (#216, #213) already in place to catch any regressions.

**Approximate scope**: ~2 PRs, ~300 lines new/modified code, ~12 hours total.

### Phase 3: Evaluation & Learning

```
#219
```

**Why last**: It's the capstone — it consumes all the signals generated by Phases 1 and 2. Implementing it earlier would mean a weaker disagreement score (fewer validation signals) and higher per-annotation cost (no caching). It also has the softest external dependency (community dataset for validation).

**Start with**: The disagreement score module and annotation export CLI; defer Langfuse until justified by volume.

**Approximate scope**: ~1 PR, ~200 lines new code, ~6 hours.

---

## Summary

```
Phase 1 (Validation):  #215 → #216 → #213    ~3 PRs, low risk, immediate quality wins
Phase 2 (Providers):   #206 → #222            ~2 PRs, moderate risk, cost + reliability
Phase 3 (Learning):    #219                    ~1 PR, builds on everything above
```

**All 6 are compatible and complementary.** The main constraints are:
1. #206 before #222 (Anthropic provider structure dependency)
2. #215 before #216 (date parsing reuse)

The grouping into Validation → Providers → Learning reflects a natural bottom-up build: strengthen the data quality layer, then optimize the API layer, then build the feedback loop on top.
