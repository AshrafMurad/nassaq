# Nassaq shell design

Owner-approved Neo-Brutalist restyle, 2026-10-29. This applies to the compact
Phase 1 shell: introduction, local file picker/details, workflow explanation,
privacy panel, and footer. The restyle retains the existing bilingual content
and file-selection behavior. Product/integrity/security contracts live in `docs/`.

## Direction

**Mode:** Operate. A person preparing a CSV should see the primary file action
immediately, read the explanation, and keep their place through selection/reset.
The identity is bold through contrast, type, and physical controls, not through
decorative entrances or continuous animation.

- Yellow ground with a faint 32×32px SVG dot tile.
- Fixed 80px yellow navigation, with a matching top offset and scroll padding.
- Centered, large heading and compact intro; white file-selection panel.
- Charcoal workflow panel, sage privacy panel, charcoal footer.
- Same section order at every breakpoint; no marketing-only panels or claims.

## Tokens

| Role | Value |
| --- | --- |
| Yellow | `#ffe17c` |
| Charcoal | `#171e19` |
| Sage | `#b7c6c2` |
| UI / ink | `#ffffff` / `#000000` |
| Borders | `2px solid #000000` |
| Control shadow | `4px 4px 0px 0px #000000` |
| Panel shadow | `8px 8px 0px 0px #000000` |
| Control / panel radius | `12px` maximum / `16px` |
| Hover translation | `translate(4px, 4px)` |
| Movement timing | `160ms cubic-bezier(0.23, 1, 0.32, 1)` |
| Color feedback | `120ms ease` |
| Focus | `3px solid` outline, `4px` offset, black or yellow on charcoal |

No soft shadows or gradients. The pattern is a repeating SVG circle with 10%
ink opacity, not a gradient. Never apply heading styles to file data.

## Typography and assets

Owner-approved OFL alternatives: Archivo 800 headings, Manrope 500 body/UI
(700 controls), Noto Sans Arabic for Arabic glyphs. All three variable WOFF2
files are first-party assets under `public/fonts/`; upstream licenses and source
URLs are included there. The total font payload is approximately 221 KiB before
HTTP compression. No remote runtime font requests, dependency packages, font
subsetting pipeline, or font persistence was added.

Cabinet Grotesk and Satoshi were evaluated but not bundled: the downloaded ITF
FFL 2.0 restricted repository redistribution. The owner explicitly approved
open-source alternatives. Arabic uses natural tracking and a more generous
heading line-height; Latin display text uses -0.04em tracking. Other scripts
retain system fallback, and filenames remain escaped and direction-isolated.

## Interactions and accessibility

- `.neo-control` owns the 2px border, hard shadow, and visible outline.
- `.neo-push` moves on hover/press only with fine pointers, hover support, normal
  motion preference, and no keyboard-visible focus. Its shadow snaps off rather
  than animating a paint property. CSS transitions make rapid reversals smooth.
- Keyboard-focused controls never translate. Touch gets immediate color/outline
  feedback; no sticky hover movement. Reduced motion removes transitions and
  transforms while preserving state styling.
- Selection focuses the file-details heading. Reset focuses the native file
  input, whose visible label gets an immediate outline. Initial load does not
  steal focus. Focus changes do not scroll the page.
- Picker and details have an 18rem minimum height, not a fixed height; long names,
  localization, zoom, and the native full-filename disclosure may grow naturally.
- File drag-over changes the panel fill and explanatory text. Text confirms the
  state independently of color.
- Phone layout uses full-width primary action and at least 44px touch targets.
  Header GitHub text hides on phones while its accessible name remains intact.
- Workflow remains an ordered list with visible numbered markers. Its numbers
  convey real sequence. All substantive copy is maintained in AR/EN resources.

## Review workspace extension

The Phase 6 review state keeps the initial upload, explanation and privacy
panels compact, but expands the selected-file workspace to 72rem on desktop.
The data preview leads the review journey, uses the available width, grows to
600px tall and keeps row/column headers sticky inside its own scroll region.
Mobile remains stacked with horizontal table scrolling and no page overflow.

Optional repair suggestions appear after the preview and stay collapsed by
default. Opening the panel shows ten worker-backed suggestions per page with
explicit Previous/Next controls, visible whitespace markers in diffs and
distinct staged vs confirmed badges. Multiline cell editing preserves line
breaks; small visual icon controls retain 44px hit areas. Confirming, undoing
or redoing an edit invalidates any older verified workbook immediately.

## Verification boundary

Automated browser checks cover selection/reset focus, AR/EN direction, native
filename disclosure, phone overflow, button pointer/keyboard/reduced-motion
behavior, and local-only requests. Real-device touch and screen-reader checks
remain manual release follow-ups.
