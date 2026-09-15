# Jubal Studio — Premium Docking Workspace

This revision replaces the previous HTML5 drag/drop + grid-snapping interaction with a pointer-driven docking engine designed to feel stable under the mouse.

## Interaction model

- Pointer Events + pointer capture are used for drag and resize.
- Motion is rendered through `requestAnimationFrame` rather than mutating layout on every raw pointer event.
- A dragged panel becomes a fixed floating surface; the underlying grid remains stable.
- Hovering a destination does **not** move the grid. The target panel shows an edge drop zone and a separate insertion guide shows where the panel will be inserted.
- The grid is reordered only once, on pointer release, then affected panels animate to the new layout using FLIP-style transforms.
- `Escape`, pointer cancellation, or window blur cancels the interaction safely.

## Resize model

- Width/height change continuously in pixels while the pointer moves. There is no visible grid-step jumping.
- A separate translucent preview shows the eventual snapped grid footprint.
- The grid footprint is committed only on release.
- Width, height, and corner resize hit areas are provided.

## Workspace controls

- `Lock layout` disables drag/resize after the user finishes arranging the workstation.
- `Reset layout` restores default order and sizes.
- Dock order, spans, visibility and lock state persist in localStorage.
- Below 1100px, the workspace falls back to a responsive non-draggable layout.

## Harmony keyboard

The accompaniment/chord keyboard remains percentage-based and scales to the dock width. It was tested at the minimum two-column dock width without horizontal overflow.
