# Solver Integration Roadmap and Current App Documentation

Last updated: 2026-04-12

## Purpose

This document has two jobs:

1. Document what the app currently does.
2. Define a practical roadmap from the current engine to implemented solver-backed integration.

## 1. Current Application Functionality

### 1.1 Training Modes

The app currently provides six training modes:

- All Skills
- Pot Odds
- Preflop
- Postflop
- Bet Sizing
- Table Positions

### 1.2 All Skills Mode (Core Engine)

All Skills is the central multi-street training loop and currently includes:

- Street progression: preflop, flop, turn, river.
- Spot types:
  - preflop_open
  - preflop_facing_open
  - checked_to_hero
  - facing_bet
- Context assembly per decision node:
  - hand class
  - board texture
  - stack and pot values
  - number of players and active opponents
  - ghost pressure fields for effective multiway dynamics
- Baseline decision policy (default strategy line).
- Exploit adjustment policy by villain archetype.
- Ghost-pressure adjustment layer that can tighten or neutralize otherwise valid baseline actions.
- Action scoring:
  - best action: full credit
  - baseline-correct action: partial credit
  - acceptable alternative action (mixed-strategy-compatible): partial credit
- Fatal leak detection for severe mistakes, with capped hand scoring.
- End-of-hand summary with biggest leak and targeted cue.

### 1.3 Villain and Spot Modeling

Current villain archetypes:

- TAG
- LAG
- LP
- Maniac

Current model behaviors:

- Per-profile aggression and fold tendencies.
- Sizing preference tendencies (small, medium, large).
- Spot-specific exploit text and fallback coaching language.
- Initiative-aware wording in checked-to-hero spots.

### 1.4 Hand and Board Evaluation

Postflop evaluation currently supports:

- Best-five-card hand classification.
- Made-hand categories and hand strength labels.
- Draw detection with outs and labels on flop and turn.
- River-safe behavior:
  - draw metadata is reset on river
  - no draw profile guidance is shown on river
- Equity estimation, including multiway discounts.

### 1.5 Postflop Family System

The app contains a postflop family framework used for scenario grouping and curriculum-style repetition. Family matching logic classifies generated nodes into predefined learning families and tracks weakness by family over time.

### 1.6 Persistence and Progress Tracking

Local persistence currently stores:

- Accuracy and volume stats
- Points
- Streak and best streak
- Weakness maps by skill tag
- Postflop family weakness maps
- Exam mode toggle

### 1.7 Existing Quality Coverage

The project includes:

- Automated tests for evaluation, preflop behavior, ghost logic, wording, and scoring consistency.
- Build and deployment scripts for static hosting.
- A review issues tracker documenting learning-critical fixes already completed.

## 2. Target Outcome for Solver Integration

Implement a solver-backed basis-of-truth for covered postflop spots while preserving:

- Beginner-friendly speed
- Clear explanations
- Existing exploit pedagogy where useful
- Deterministic scoring quality

## 3. Scope for First Solver-Integrated Release

### In Scope

- Heads-up postflop spots first.
- Core node types:
  - checked_to_hero
  - facing_bet
- Mapping solver outputs into current action buckets:
  - check
  - bet-small
  - bet-medium
  - bet-large
  - fold
  - call
  - raise-small
  - raise-large
- Frequency-based grading thresholds for:
  - best
  - acceptable alternative
  - incorrect

### Out of Scope (First Release)

- Full preflop solving.
- Arbitrary live custom solves in main learner flow.
- Large infrastructure backend rollout.

## 4. Roadmap From Now to Implemented Solver Integration

Roadmap assumes a precompute-first approach.

## Phase 0: Alignment and Contracts 

Goals:

- Freeze integration architecture.
- Define data contracts between solver outputs and app runtime.

Deliverables:

- Canonical spot key schema (position, stack bucket, board texture class, node type, action history key).
- Action bucket mapping spec (solver amount to app action token).
- Frequency threshold spec for grading.
- Fallback behavior spec for uncovered spots.

Exit criteria:

- Contract approved and documented.
- No unresolved ambiguity in action mapping.

## Phase 1: Offline Solver Pipeline Prototype 

Goals:

- Produce first usable solver dataset for a limited spot set.

Deliverables:

- Precompute pipeline that ingests scenario templates and outputs compact artifacts.
- First dataset covering 50 to 100 high-frequency educational spots.
- Metadata file with solver version, generation date, and threshold config.

Exit criteria:

- Artifacts generated reproducibly.
- Data loads cleanly in a standalone validator script.

## Phase 2: Runtime Loader and Shadow Evaluation 

Goals:

- Integrate solver data read path without changing learner-facing behavior.

Deliverables:

- Runtime lookup module keyed by canonical spot ID.
- Shadow comparator that logs differences between heuristic and solver recommendations.
- Diagnostic report for top mismatch clusters.
- In-app shadow status surface with promotion readiness and blocker visibility.
- Calibration reset control for clean measurement windows.

Exit criteria:

- Existing UX remains unchanged.
- Shadow mismatch report is available and actionable.
- Shadow promotion readiness is evaluated from explicit operational gates.

## Phase 3: Scoring Integration for Covered Spots 

Goals:

- Switch grading source to solver-backed frequencies where coverage exists.

Deliverables:

- Solver-backed best action selection.
- Solver-backed acceptable alternatives based on frequency thresholds.
- Updated feedback text that explains mixed strategies in plain language.

Exit criteria:

- Covered spots grade from solver truth.
- Uncovered spots safely fall back to current heuristic logic.

## Phase 4: Coverage Expansion and Calibration 

Goals:

- Expand practical coverage and reduce fallback frequency.

Deliverables:

- Dataset expanded to at least 300 curated spots.
- Calibration pass on thresholds by learner experience level.
- Updated tests for regression safety in mixed strategy spots.

Exit criteria:

- Fallback rate is acceptably low for normal training flow.
- No major contradictions between guidance and grading on covered spots.

## Phase 5: Release Readiness and Documentation

Goals:

- Ship solver-integrated version with clear operational and user documentation.

Deliverables:

- Release notes and feature flags documented.
- Coverage matrix published (what is solver-backed vs fallback).
- Risk and compliance note documented.

Exit criteria:

- Full test suite and build pass.
- Team sign-off on learner-facing quality.

## 5. Definition of Done: Implemented Solver Integration

Solver integration is considered implemented when all of the following are true:

- Covered postflop spots are graded from solver-derived frequencies.
- Acceptable alternative logic is solver-driven, not heuristic-only.
- Uncovered spots use stable fallback without broken UX.
- Learner feedback explains why mixed options can both be valid.
- Coverage, thresholds, and generation metadata are documented.
- Regression tests verify critical solver-mapped behavior.

## 6. Risk Register and Mitigation

### Technical Risks

- Data schema drift between generator and runtime.
  - Mitigation: schema versioning and validation checks.
- Bucket mapping ambiguity for fractional or nonstandard bet sizes.
  - Mitigation: deterministic nearest-bucket rule with tie-break policy.
- Coverage gaps that surface too many fallback spots.
  - Mitigation: prioritized expansion by observed spot frequency.

### Product Risks

- Overly technical feedback for beginners.
  - Mitigation: keep user text plain-language and action-first.
- Perceived inconsistency during transition period.
  - Mitigation: explicit labeling of solver-backed vs fallback decisions.

### Legal and Dependency Risks

- Solver licensing constraints and obligations.
  - Mitigation: keep a documented compliance path before external distribution changes.
- Upstream solver project maintenance uncertainty.
  - Mitigation: pin versions and keep a reproducible generation pipeline.

## 7. Immediate Next Actions (2026-04-12)

Progress completed in the latest cycle:

1. Implemented a logic-first tuning pass for dominant hard-mismatch conflict pairs in `src/App.jsx`.
  - Added targeted OOP medium-pressure probes in selected turn/flop family branches to reduce check -> bet-large hard conflicts.
  - Added selective OOP draw semibluff raise behavior in facing-bet pressure branches to reduce fold -> raise-large hard conflicts.
2. Added regression coverage for these branches in `src/test/engine.eval.test.jsx`.
3. Validation completed successfully: targeted tests, full test suite, and production build all pass.

Next steps (no Phase 3 cutover yet):

1. Reset solver shadow calibration data and run fresh sample window A (150 to 200 solver-eligible hands).
2. Reset again and run independent sample window B (150 to 200 hands) to avoid single-run noise.
3. Compare both runs against baseline and current gates, with hard mismatch rate as primary blocker.
4. Confirm top recurring hard-mismatch clusters are shrinking, not just headline percentages.
5. If hard mismatch remains above gate, continue conflict-pair-specific logic tuning before considering any threshold changes.
6. If uncovered clusters persist, request targeted additional solver artifacts from the external solver pipeline.

Important scope note:

- Generating or solving new solver JSON is not performed in this repository. This repo imports, adapts, and validates externally produced artifacts.

## 8. Current Repository Implementation Status (2026-04-12)

The following roadmap foundations are now implemented in this repository:

- Phase 0 contract scaffolding implemented:
  - Canonical spot key builder for heads-up postflop nodes.
  - Deterministic solver amount to action bucket mapping.
  - Default frequency grading thresholds (`best >= 0.50`, `acceptable >= 0.15`).
- Phase 1 offline prototype pipeline implemented:
  - Reproducible generator script: `npm run solver:generate`.
  - External artifact import script: `npm run solver:import`.
  - Raw-to-contract adapter script: `npm run solver:adapt`.
  - Dry-run import preview: `npm run solver:import:dry`.
  - Import and validate in one step: `npm run solver:sync`.
  - Validation script: `npm run solver:validate`.
  - Combined refresh command: `npm run solver:refresh`.
  - Current prototype artifact size: 200 spots total:
    - 50 flop checked-to-hero
    - 50 flop facing-bet
    - 50 turn checked-to-hero
    - 50 turn facing-bet
- Phase 2 shadow evaluation scaffolding implemented:
  - Runtime lookup path for canonical spot keys.
  - Shadow comparator logging with no learner-facing scoring/UI changes.
  - Local diagnostic report generation with top mismatch clusters.
  - Canonical history key alignment for current phase-1 artifact key schema.
  - Solver eligibility guardrails restricted to currently covered streets (`flop`, `turn`) and heads-up no-ghost spots.
  - Promotion-readiness gate evaluation embedded in shadow diagnostics.
  - In-app "Solver Shadow Status" panel with readiness state, blocker list, and calibration reset action.

Latest calibration baseline before this tuning pass (covered-denominator metrics):

- Samples: 151 total, 143 covered (94.7%), 8 uncovered (5.3%).
- Hard mismatch: 36.4% (blocked vs gate 18.0%).
- Soft mismatch: 31.5% (within gate 35.0%).
- Agreement: 32.2%.

Latest implementation update in this repository:

- Logic-first hard-mismatch tuning was implemented in family exploit calibration branches.
- New regression tests were added for OOP pressure branches and semibluff behavior.
- No new solver spot JSON files were generated in this tuning pass.

Current stability snapshot:

- Solver artifact validator passes on current dataset (`spotCount: 200`).
- Canonical index entries match current raw spot count (200 raw files, 200 indexed canonical spots).
- Full app test suite and production build pass after shadow hardening changes.

Operational shadow gate defaults (current):

- Minimum samples: `120`
- Maximum uncovered rate: `20%`
- Maximum hard mismatch rate (covered spots): `18%`
- Maximum soft mismatch rate (covered spots): `35%`

Current artifact location:

- `public/data/solver/manifest.json`
- `public/data/solver/index.json`
- `public/data/solver/heads-up-flop-checked.json`
- `public/data/solver/heads-up-flop-facing.json`
- `public/data/solver/heads-up-turn-checked.json`
- `public/data/solver/heads-up-turn-facing.json`

Current implementation note:

- Prototype frequencies are synthetic educational placeholders for integration and validation flow.
- Replace generated frequencies with true solver exports in the next iteration without changing runtime contracts.

## 9. External Pipeline Topology and Import Workflow

Preferred local topology:

- `c:/Users/opiskelija/Documents/pokeri/f-e-s-h.github.io` (this app repository)
- `c:/Users/opiskelija/Documents/pokeri/postflop-solver` (external solver pipeline repository)

Rationale:

- Keeps AGPL solver source outside this app repo history.
- Reduces accidental commits of solver engine source files.
- Preserves current runtime model: app consumes static JSON artifacts only.

App-side import workflow:

1. Generate artifact bundle in external pipeline output directory (example: `../postflop-solver/artifacts/f-e-s-h`).
2. Preview import file set and stale-file removals:
  - `npm run solver:import:dry -- ../postflop-solver/artifacts/f-e-s-h`
3. Import, adapt, and validate:
  - `npm run solver:import -- ../postflop-solver/artifacts/f-e-s-h`
  - `npm run solver:adapt`
  - `npm run solver:validate`
  - Optional one-step sync (default source path): `npm run solver:sync`
4. Regression gate before commit:
  - `npm test`
  - `npm run build`

Import behavior details:

- Reads `manifest.json` and `index.json` from source bundle.
- Copies only files referenced by manifest/index into `public/data/solver`.
- Removes stale destination JSON files not referenced by current index.
- Fails fast on missing or invalid JSON before writing.
