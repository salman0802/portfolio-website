# Jubal Studio V9 — Optional Sticky Main Keyboard

- Added an opt-in pin control directly on the main Performance keyboard.
- Sticky keyboard is OFF by default.
- When enabled, the keyboard stage stays pinned to the bottom of the Performance workspace while that view scrolls.
- Preference persists in `localStorage` under `jubalStudioKeyboardSticky`.
- The pin button exposes `aria-pressed`, a descriptive label, and a tooltip.
- Sticky state works with both dark and soft-light themes.
- The keyboard remains horizontal-scroll-only; the new control cannot introduce vertical scrolling.
- Removed the previous always-sticky behavior by forcing the inner keyboard dock back to normal positioning and applying sticky positioning only to the outer keyboard stage when the user opts in.
