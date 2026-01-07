# 01 — Foundation

## Goal

Set up the app foundation so the provided components can be dropped in with minimal translation:

- React + Tailwind v4
- Design tokens (light/dark)
- Font setup
- Icon system (`@solar-icons/react` only)
- Basic shell layout (minimal header + workspace content)

## Requirements

- Tailwind CSS v4 (no `tailwind.config.js`)
- Install `@solar-icons/react` (do not add/use `lucide-react`)

## Steps

1. Add global CSS that imports Tailwind and `design-system/tokens.css`.
2. Map CSS variables into Tailwind semantic colors via `@theme inline` (see `design-system/tailwind-colors.md`).
3. Add Google Fonts (see `design-system/fonts.md`) and set font families at the app root.
4. Implement the app shell using `shell/components/AppShell.tsx` as the reference.
5. Ensure the app renders at least one route/view where the workspace section will mount.

