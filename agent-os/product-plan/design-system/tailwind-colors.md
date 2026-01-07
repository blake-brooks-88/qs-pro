# Tailwind v4 + Design Tokens

This project uses Tailwind CSS v4 with CSS variables (no `tailwind.config.js`).

## Recommended Setup

1. Ensure Tailwind v4 is installed and `@import "tailwindcss";` is present in your global CSS.
2. Import `design-system/tokens.css` before your component styles so the CSS variables exist.
3. Map semantic variables to Tailwind v4 theme tokens using `@theme inline` (example below).

## Example (global CSS)

```css
@import "tailwindcss";
@import "./design-system/tokens.css";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-error: var(--error);
  --color-error-foreground: var(--error-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
}
```

