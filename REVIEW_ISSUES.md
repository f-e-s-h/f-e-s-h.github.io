# Poker Trainer: Learning-Critical Review Issues

This file only lists issues that materially impact learning quality or user trust.

## 1) River still shows draw profile and outs (conceptually wrong)
- Severity: High
- Learning impact: Teaches incorrect river concepts (there are no future cards, so "draw outs" should not drive decision framing).
- User impact: Confusing and trust-eroding when UI says river draw/outs are active.

### Evidence
- Draw classification intentionally excludes river draws:
  - `src/App.jsx:2041` (`draw.outs > 0 && street !== 'river'`)
- But draw metadata is still returned regardless of street:
  - `src/App.jsx:2062` (`drawOuts: draw.outs`)
  - `src/App.jsx:2063` (`drawLabel: draw.label`)
- UI renders draw profile whenever drawOuts > 0:
  - `src/App.jsx:3394` (`Draw profile: ... ({...} outs)`)

### Why this should be fixed
- It creates a direct contradiction between river game-tree reality and displayed coaching cues.

---

## 2) Heads-up checked-to-hero draw spots are over-forced into large betting
- Severity: Medium
- Learning impact: Overstates one "best" action in spots that are often mixed in practice; this can miscalibrate sizing intuition.
- User impact: Players get marked wrong in plausible check or smaller-size lines with limited explanation of strategic tradeoffs.

### Evidence
- Draw strength is hard-mapped to large size bands:
  - `src/App.jsx:1484` (`if(sit.strength === 'draw') return ['threequarter', 'pot'];`)
- Preferred action maps those bands to `bet-large` when available:
  - `src/App.jsx:2202`
- Checked-to-hero draw baseline in heads-up defaults to that preferred bet action:
  - `src/App.jsx:2401-2415`

### Why this should be fixed
- Deterministic "large or wrong" guidance in these nodes can reduce educational realism and punish valid lower-variance lines.

---

## 3) Exploit fallback wording references "price point" in no-price spots
- Severity: Low-Medium
- Learning impact: Blends call-vs-price language into checked-to-hero nodes where no immediate pot-odds decision exists.
- User impact: Feedback feels generic/inaccurate and reduces confidence in coach explanations.

### Evidence
- Fallback message includes "price point keep baseline best":
  - `src/App.jsx:2577`
- Same fallback can appear in checked-to-hero contexts:
  - `src/App.jsx:2566` (`checked_to_hero` situation text branch)

### Why this should be fixed
- Explanations should use node-appropriate terminology (initiative/value/bluff pressure vs price/pot-odds) to avoid conceptual leakage.

---

## 4) Strong made hands on paired/dry checked-to-hero boards are over-forced into large betting
- Severity: Medium
- Learning impact: Teaches an overly rigid "bet large or wrong" heuristic in spots that are commonly mixed and often prefer smaller sizing/check frequency.
- User impact: Marks plausible check lines as incorrect, reducing trust and encouraging over-aggression in low-protection/value-thin nodes.

### Evidence
- Two-pair from board-pair + hero kicker is bucketed as `strong`:
  - `src/App.jsx:2029-2032`
- Checked-to-hero `strong` always routes to preferred bet action (no paired-board pot-control branch):
  - `src/App.jsx:2393-2399`
- Strong sizing bands include `threequarter`, and preferred mapping converts that to `bet-large` when available:
  - `src/App.jsx:1482`
  - `src/App.jsx:2202`

### Why this should be fixed
- On boards like `A A 9` with medium-strength showdown value (for example `9x`), forcing large c-bets as the single "best" line is too coarse for training and can miscalibrate postflop strategy.

---

## 5) Internal sizing contradiction: strong hands allow 50-75% in rules, but grader collapses to only large
- Severity: Medium
- Learning impact: Teaches that one of the trainer's own approved sizings is "wrong," which undermines sizing fundamentals.
- User impact: In spots like `QQ` on `6s Jh 10h 2s` (checked to hero, heads-up), a reasonable `Bet Medium` line is marked incorrect with `best: Bet Large`.

### Evidence
- Rule layer defines strong as a range (`half`, `threequarter`):
  - `src/App.jsx:1482`
- Action selector collapses any range containing `threequarter` into `bet-large` when available:
  - `src/App.jsx:2202`
- Checked-to-hero strong baseline always delegates to that collapsed selector:
  - `src/App.jsx:2393-2399`

### Why this should be fixed
- This is not just solver disagreement; it is an internal logic inconsistency between guidance and grading that can confuse learners and reduce trust in feedback quality.

---

## 6) Ghost overlay over-tightens BTN first-in steals by auto-folding weak opens in 3-way dynamics
- Severity: Medium
- Learning impact: Can misteach late-position opening discipline by treating many standard BTN steal opens as folds as soon as one ghost player is added.
- User impact: Produces confusing feedback where baseline says "steal from late position" but final grading marks the raise incorrect due to ghost override.

### Evidence
- Baseline weak unopened late-position logic recommends a raise steal:
  - `src/App.jsx:getDecision(...)` weak + unopened + BTN/CO branch
- Ghost preflop-open adjustment folds `weak` (and `speculative`) hands when ghost pressure exists:
  - `src/App.jsx:2629-2681` (`allSkillsApplyGhostPressure` preflop_open branch)
- This creates a deterministic raise->fold flip even for BTN first-in nodes with only +1 ghost.

### Why this should be fixed
- In training terms, this is too blunt for late-position preflop education and risks teaching players to over-fold profitable steal candidates.

---

## Not included (by design)
- Pure solver-preference disagreements without clear UX/learning harm.
- Cosmetic UI-only concerns that do not change user understanding.
