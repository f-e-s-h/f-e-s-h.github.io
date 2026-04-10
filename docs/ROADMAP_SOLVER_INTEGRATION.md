# Solver Integration Roadmap and Current App Documentation

Last updated: 2026-04-10

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

Exit criteria:

- Existing UX remains unchanged.
- Shadow mismatch report is available and actionable.

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

## 7. Immediate Next Actions

1. Finalize canonical spot key and action bucket mapping spec.
2. Build and validate the first 50 to 100 precomputed solver spots.
3. Add shadow evaluation logging in the app without user-facing behavior changes.
