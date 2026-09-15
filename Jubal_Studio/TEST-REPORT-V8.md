# Jubal Studio V8 — Validation

- All JavaScript modules pass `node --check`.
- All local ES module imports resolve.
- HTML contains 186 IDs and all 186 are unique.
- Every static `getElementById()` reference used by JavaScript exists in the HTML (runtime-created editor action IDs excluded by design).
- CSS parses with zero stylesheet parse errors using tinycss2.
- Main keyboard CSS asserts 240px white-key height and 150px black-key height.
- Keyboard/instrument wrappers assert `overflow-y: hidden !important` and horizontal-only touch behavior.
- UI code includes a non-passive wheel guard that prevents vertical touchpad scrolling over keyboard/instrument surfaces.
- Theme preference is persisted under `jubalStudioTheme` and initialized before the stylesheet paints when possible.
