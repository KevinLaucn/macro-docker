---
name: macro-ui-design
description: Implement or review Macro frontend UI/UX changes while preserving the repository's native design system. Use for pages, components, layouts, colors, typography, icons, motion, responsive behavior, empty/loading/error states, and other user-visible apps/web work.
---

# Macro UI Design Standard

Use this skill for every user-visible change under `apps/web`. The goal is not to invent a new visual language; it is to make the change look and behave as if it came from Macro upstream.

## Authority and precedence

Treat the current repository as the source of truth. Before implementation, consult:

1. [apps/web/AGENTS.md](../../../../../apps/web/AGENTS.md), especially the UI and component rules beginning around line 77, for frontend behavior and component conventions.
2. [docs/STYLE_GUIDE.md](../../../../../docs/STYLE_GUIDE.md), especially the frontend `FE-*` rules beginning around line 162.
3. `apps/web/src/components/ui/index.ts` and `apps/web/src/components/ui/components/` for canonical primitives.
4. `apps/web/src/features/theme/types/themeTypes.ts` and `apps/web/src/index.css` for design tokens.
5. A current, good reference implementation near the target. Prefer `src/features/activity`, `src/features/entity`, `src/features/channel`, `src/features/block-md`, and `src/features/next-soup`. Do not copy known legacy patterns merely because they already exist.

If this skill conflicts with a newer repository rule or a canonical component API, the current repository wins. Update the skill rather than working around the repository.

Before implementing or reviewing UI changes, read the relevant sections of both linked files. Treat them as living, authoritative repository policy; the line numbers above are navigation hints rather than fixed boundaries.

## Non-negotiable invariants

### Reuse before creation

- Search with CodeGraph before reading broadly or creating UI. Locate the closest existing screen, interaction, and component usage.
- Import canonical primitives through `@ui` whenever exported there. Check the component implementation and existing call sites before deciding its API cannot satisfy the requirement.
- Prefer extending an existing primitive with a generally useful slot or variant over creating a parallel component.
- Do not recreate buttons, dialogs, menus, dropdowns, selects, checkboxes, tabs, tooltips, hover cards, badges, avatars, switches, navigation rows, panels, surfaces, empty states, pagers, steppers, or confirmation/delete flows. Use their `@ui` implementations.
- Use Kobalte for accessible behavior when the repository has no higher-level Macro primitive. Do not hand-roll focus traps, roving focus, keyboard menus, dialogs, listboxes, switches, or disclosure semantics.
- Feature-specific composition is allowed and expected. “No custom components” means no duplicate primitive or parallel design system; it does not prohibit composing canonical primitives into a named feature component.
- A new shared primitive is a last resort. Before adding one, record which `@ui` components and good-reference patterns were checked, why composition or extension is insufficient, and ensure the primitive has no service/query dependency.

Canonical inventory starts at `apps/web/src/components/ui/index.ts`, including `Button`, `ButtonGroup`, `Dialog`, `ConfirmDialog`, `DeleteDialog`, `Dropdown`, `Select`, `Checkbox`, `Tabs`, `TabbedControl`, `SegmentedControl`, `ToggleSwitch`, `Tooltip`, `HoverCard`, `Badge`, `Avatar`, `Panel`, `Surface`, `Layer`, `NavRow`, `SideNav`, `EmptyStatePanel`, `Pager`, `Stepper`, `Scroll`, `Hotkey`, `PillButton`, `SendButton`, and command-menu primitives. Always read the current index because the inventory evolves.

### Colors and surfaces

- Use semantic Tailwind tokens, never raw palette shades or one-off literals for application chrome.
- Preferred semantic tokens include `surface`, `inset`, `page`, `panel`, `dialog`, `menu`, `tooltip`, `toast`, `input`, `message`, `hover`, `active`, `selected`, `ink`, `ink-muted`, `ink-subtle`, `ink-disabled`, `ink-placeholder`, `accent`, `success`, `warning`, `failure`, `edge`, and `edge-muted`, including their existing `-bg`, `-ink`, and `-hover` variants where defined.
- Never introduce `text-red-500`, `bg-gray-100`, `black`, `white`, arbitrary hex/RGB/HSL/OKLCH values, or component-local CSS variables as substitutes for Theme tokens. Raw Tailwind palette classes are disabled and may render no CSS.
- Do not add a new semantic color token for a single feature. Reuse the closest existing semantic role. A new token requires a cross-feature design-system need and updates to the central theme definitions, defaults, validation, and built-in themes.
- Opacity modifiers on semantic tokens are acceptable when an established neighboring pattern uses them and contrast remains legible.
- Domain-authored colors are an exception only when color is user/document data, such as canvas/PDF content or a user-selected palette. Reuse the domain's existing color parser/utilities; do not leak those colors into app chrome.

### Typography

- In normal product UI, use the repository's established Tailwind scale: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, or `text-3xl`. Most controls, metadata, and body UI use `text-xs` or `text-sm`.
- Reuse typography already present in the nearest equivalent canonical component. Do not choose a size in isolation.
- Do not add arbitrary sizes such as `text-[13px]` or inline `font-size` for new UI. Existing legacy occurrences are not precedent. If pixel-exact compatibility with an existing shared component is required, extend or reuse that component instead.
- Use the existing font families (`font-sans`, `font-mono` where content is genuinely code/monospace). Do not import or declare a new font family.
- Prefer existing weights: normal body copy, `font-medium` for controls/emphasis, and `font-semibold` for established headings. Avoid arbitrary numeric font weights and unnecessary bold text.
- Preserve text hierarchy and density from the nearest existing screen. Do not enlarge typography merely to make a feature visually distinctive.
- User-facing strings must follow the repository i18n workflow and must not be embedded as untranslatable fragments.

### Spacing, sizing, radius, and layout

- Reuse the nearest equivalent component's spacing and responsive/container-query pattern. Macro is a dense productivity UI; do not introduce marketing-page spacing into product surfaces.
- Use the existing Tailwind spacing, size, radius, border, shadow, and z-index utilities. Avoid arbitrary values when an established token or component variant exists.
- Use canonical control sizes and variants. For example, choose a `Button` `size`/`variant`; do not reproduce its height, padding, radius, icon size, hover, disabled, or touch behavior in a raw `<button>`.
- Respect narrow/mobile layouts, overflow, long translated strings, zoom, and touch target behavior. Follow nearby container queries rather than adding an unrelated breakpoint scheme.
- Do not add `cursor-pointer` to clickable elements. Native/Kobalte semantics and hover/focus states communicate interactivity.

### Icons

- Reuse the icon library and icon choices already used by adjacent Macro features. Do not draw custom SVGs or introduce another icon dependency for an icon that already exists.
- Icon-only actions must use the canonical `Button`/`Tooltip` accessibility path and have a stable accessible label.
- Match canonical component icon sizing instead of setting an unrelated arbitrary size.

### Motion and feedback

- Motion must explain state change, spatial relationship, progress, or focus. Do not add decorative animation simply to make a view feel different.
- Prefer existing component motion. Use `Stepper.transitions`, dialog/drawer animation classes, accordion transitions, `animate-spin` for indeterminate progress, and `animate-pulse`/`bg-skeleton` for established skeleton loading patterns.
- For simple feedback, prefer `transition-colors`, `transition-opacity`, or `transition-transform` over `transition-all`.
- Follow the repository's short timing language: approximately 100 ms for exits/immediate controls, 150 ms for common feedback, 200 ms for standard transitions, and up to 300 ms for larger spatial movement. Do not invent long or spring-like motion without an existing product precedent.
- Match established easing: usually `ease-out` on entry, `ease-in` on exit, and `ease-in-out` for reversible movement.
- Every nonessential transition/animation must respect reduced motion using `motion-reduce:transition-none`, an existing component implementation, or `prefers-reduced-motion`. Never require motion to understand or complete an action.
- Loading, success, failure, disabled, permission-gated, and destructive states must use existing primitives and semantic tokens. Do not communicate state by color alone.

### Interaction and accessibility

- Use semantic elements and canonical components. Preserve keyboard operation, visible focus, Escape behavior, autofocus, focus return, screen-reader naming, and disabled state.
- Let Kobalte dialogs use their default autofocus unless a documented workflow requires a different target.
- Truncated or collapsed controls need a tooltip. Icon-only buttons need an accessible label.
- Pending or permission-gated actions should render the recognizable action in a dimmed/controlled state with inline resolution where applicable, not an unrelated placeholder.
- Never read Solid Query resource data eagerly in a way that suspends and remounts unrelated UI. Follow the guarded patterns in `apps/web/AGENTS.md`.
- For editor overlays on physical iOS, follow the repository rule to preserve focus by handling both pointer and compatibility mouse events.

## Implementation workflow

1. **Discover:** Use `codegraph explore` for the requested UI and identify the closest canonical component and good reference screen. Inspect `@ui` before creating anything.
2. **State the reuse plan:** Name the primitives, semantic tokens, typography scale, and existing interaction pattern that will be reused.
3. **Compose:** Keep data fetching/mutations in queries or feature orchestration. Keep primitives small and free of use-case-specific context.
4. **Check all states:** Default, hover, active, focus-visible, disabled, loading, empty, error, permission-gated, destructive, narrow/mobile, long translated text, dark/light themes, and reduced motion as relevant.
5. **Verify:** Exercise user-visible behavior in a real browser. Static checks cannot prove interaction quality.

## Required validation

Run proportionally, using the repository's current commands as authority:

```bash
just check

# For core types, shared components, design tokens, or broad UI changes:
just check full

cd apps/web
bunx vitest
just check-tailwind
just build-dev
```

Also run focused tests for changed primitives and theme utilities. When modifying email rendering, run `just test-email-rendering`; update snapshots only when the visual change is intentional and reviewed.

In browser verification, check at least the affected desktop and narrow/mobile layout, keyboard focus path, light/dark theme behavior, and reduced-motion behavior when motion changed. A change is not complete merely because TypeScript, Biome, or Vitest passes.

## Review rejection conditions

Reject or revise a UI change when it:

- duplicates an existing `@ui` or Kobalte primitive;
- introduces raw palette colors, one-off app-chrome color literals, arbitrary font sizes, or a new font;
- invents component-local visual conventions instead of following a nearby good reference;
- uses raw buttons/dialogs/menus/selects without preserving the canonical behavior;
- adds decorative or long animation, ignores reduced motion, or conveys state only through motion/color;
- skips loading, empty, error, disabled, permission, responsive, focus, or translation behavior relevant to the flow;
- passes lint but has not been exercised in a real browser.

## Completion report

For UI work, report:

- canonical components and patterns reused;
- semantic tokens, typography, and motion conventions used;
- any new primitive or token and the evidence that it was unavoidable;
- static/test/build commands run and their result;
- browser scenarios, viewport classes, themes, keyboard path, and reduced-motion state verified.
