# Poker Trainer PWA - Roadmap

## Phase 1: Implement the Postflop Trainer
**Goal:** Add a new tab focused on postflop play, specifically Board Texture & Continuation Betting (C-Betting), which is a common leak in live home games.
- [ ] Create the Scenario Generator: Randomly generate Hero's hand and a 3-card Flop.
- [ ] Define the Variables:
  - **Preflop Action:** Did you raise (initiative) or call?
  - **Board Texture:** Dry (e.g., `K♠ 7♦ 2♣`) vs. Wet (e.g., `J♥ 9♥ 8♣`).
  - **Hand Strength:** Made hand (Top pair+), Draw (Flush/OESD), or Air.
- [ ] Create the Quiz UI: "Do you C-Bet, Check/Call, or Check/Fold?"
- [ ] Integrate with the main `PokerTrainer` component as a new tab.

## Phase 2: Mobile Optimization & Persistence
**Goal:** Make the app feel native and remember the user's progress.
- [ ] Implement `localStorage` for stats, streaks, and weakness tracking. Wrap the existing `useState` trackers in a `useEffect` that saves and loads data.
- [ ] Perform a mobile UI check: Ensure SVG mini-tables, card flexboxes, and buttons don't break or require horizontal scrolling on standard smartphone screens.
- [ ] Refine touch targets (buttons) for mobile ease of use.

## Phase 3: PWA Conversion (Ready for Home Screen)
**Goal:** Restructure the single file into a standard web project and add PWA capabilities.
- [ ] Scaffold a new Vite React project.
- [ ] Move `poker-trainer_1.jsx` into the new project structure (splitting components if necessary for cleanliness, or keeping it single-file if preferred).
- [ ] Add a `manifest.json` file:
  - Name: "Poker Trainer"
  - Short Name: "Poker"
  - Icons: Add poker chip/card icons (192x192, 512x512).
  - Display: `standalone` (hides the browser URL bar).
  - Theme/Background colors.
- [ ] Add a Service Worker: Use Vite PWA plugin (or manual service worker) to cache assets and enable 100% offline functionality.

## Phase 4: Deployment
**Goal:** Get the app live so it can be installed on the phone.
- [ ] Push the code to a Git repository.
- [ ] Deploy to a free static hosting service (e.g., Vercel, Netlify, or GitHub Pages).
- [ ] Open the live link on mobile, tap "Add to Home Screen", and start training offline.
