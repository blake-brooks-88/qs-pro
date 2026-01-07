# Styling Standards

> **Source of Truth:** `tailwind.config.ts` defines all theme values. Use configured theme colors, not default Tailwind colors.

---

## Color Palette

### Rules
- **Must** use exact theme colors
- **Do not** use default Tailwind colors (e.g., `bg-blue-500`)
- Reference `tailwind.config.ts` for all color values

---

### Neutral Palette (Primary UI Color)

**Usage:** 90% of the UI - this is your default.

| Use Case | Class | Hex/Value |
|----------|-------|-----------|
| App/Page Background | `bg-coolgray-50` | Lightest gray |
| Card/Container Background | `bg-white` | Pure white |
| Primary Text | `text-coolgray-600` | Dark gray (high contrast) |
| Secondary Text/Icons | `text-coolgray-500` | Medium gray |
| Borders/Dividers | `border-coolgray-200` | Light gray |

**Example:**
```typescript
<div className="bg-coolgray-50">
  <div className="bg-white border border-coolgray-200 rounded-xl p-6">
    <h2 className="text-coolgray-600 font-semibold">Title</h2>
    <p className="text-coolgray-500">Description text</p>
  </div>
</div>
```

---

### Brand Palettes

| Palette | Use Case | Example Classes |
|---------|----------|----------------|
| **Primary (Orange)** | Actions, CTAs, primary buttons | `bg-primary-500`, `text-primary-700` |
| **Secondary (Blue)** | Navigation, info, secondary actions | `bg-secondary-500`, `text-secondary-700` |
| **Tertiary (Green)** | Data visualization ONLY | `bg-tertiary-500`, `text-tertiary-700` |

**Examples:**
```typescript
// Primary action button
<button className="bg-primary-500 hover:bg-primary-600 text-white">
  Create Project
</button>

// Secondary/info button
<button className="bg-secondary-500 hover:bg-secondary-600 text-white">
  View Details
</button>

// Tertiary for data viz
<div className="bg-tertiary-100 text-tertiary-700">
  Growth: +15%
</div>
```

---

### Utility Palettes (Functional Status)

| Status | Background | Text | Use Case |
|--------|-----------|------|----------|
| **Success** | `bg-success-50` | `text-success-700` | Confirmations, successful actions |
| **Danger** | `bg-danger-50` | `text-danger-700` | Errors, destructive actions |
| **Warning** | `bg-warning-50` | `text-warning-700` | Warnings, cautions |
| **Info** | `bg-info-50` | `text-info-700` | Informational messages |

**Examples:**
```typescript
// Success message
<div className="bg-success-50 text-success-700 border border-success-200 rounded-lg p-4">
  Project created successfully!
</div>

// Error message
<div className="bg-danger-50 text-danger-700 border border-danger-200 rounded-lg p-4">
  Failed to delete project
</div>

// Warning banner
<div className="bg-warning-50 text-warning-700 border-l-4 border-warning-500 p-4">
  This action cannot be undone
</div>
```

---

## Interaction States (CRITICAL)

### Universal Rules

| State | Shade Rule | Example |
|-------|-----------|---------|
| **Hover** | Use `600` shade | `hover:bg-primary-600` |
| **Active/Pressed** | Use `700` shade | `active:bg-primary-700` |
| **Focus** | Visible focus ring | `focus:ring-2 focus:ring-secondary-500` |
| **Disabled** | Gray background + text | `bg-coolgray-200 text-coolgray-400` |

### Examples

**Button with All States:**
```typescript
<button
  className="
    bg-primary-500
    hover:bg-primary-600
    active:bg-primary-700
    focus:ring-2 focus:ring-secondary-500 focus:outline-none
    disabled:bg-coolgray-200 disabled:text-coolgray-400 disabled:cursor-not-allowed
    text-white font-medium px-4 py-2 rounded-lg
    transition-colors duration-150
  "
>
  Submit
</button>
```

**Link with States:**
```typescript
<a
  href="#"
  className="
    text-secondary-500
    hover:text-secondary-600
    active:text-secondary-700
    focus:ring-2 focus:ring-secondary-500 focus:outline-none
    underline
  "
>
  Learn more
</a>
```

**Input with States:**
```typescript
<input
  type="text"
  className="
    border border-coolgray-200
    focus:border-secondary-500 focus:ring-2 focus:ring-secondary-500 focus:outline-none
    disabled:bg-coolgray-100 disabled:text-coolgray-400 disabled:cursor-not-allowed
    rounded-md px-3 py-2
  "
/>
```

---

## Layout, Spacing, and Sizing

### 4-Point Grid System (Mandatory)

**Rule:** All spacing (margin, padding, gap) and sizing (width, height) must use multiples of 4px.

**Implementation:** Use Tailwind utilities based on `0.25rem` increments.

| Utility | Pixels | Use Case |
|---------|--------|----------|
| `p-1` | 4px | Tight padding (badges, pills) |
| `p-2` | 8px | Compact spacing |
| `p-4` | 16px | Standard padding |
| `p-6` | 24px | Generous padding (cards) |
| `gap-4` | 16px | Standard gap |
| `gap-6` | 24px | Larger gap |
| `h-8` | 32px | Small button height |
| `h-12` | 48px | Large button height |

**Examples:**
```typescript
// Card with 4-point grid spacing
<div className="bg-white rounded-xl p-6 space-y-4">
  <h2 className="text-xl font-semibold">Title</h2>
  <p className="text-coolgray-500">Content with 16px spacing above</p>
  <div className="flex gap-4">
    <button className="px-4 py-2">Action 1</button>
    <button className="px-4 py-2">Action 2</button>
  </div>
</div>

// Grid with consistent gaps
<div className="grid grid-cols-3 gap-6">
  <Card />
  <Card />
  <Card />
</div>
```

---

### Border Radius

| Element | Class | Pixels | Use Case |
|---------|-------|--------|----------|
| Cards/Modals | `rounded-xl` | 12px | Large containers |
| Buttons | `rounded-lg` | 8px | Interactive elements |
| Inputs | `rounded-md` | 4px | Form fields |
| Small elements | `rounded` | 4px | Badges, pills |

**Examples:**
```typescript
<div className="bg-white rounded-xl shadow-md p-6">Card</div>
<button className="bg-primary-500 rounded-lg px-4 py-2">Button</button>
<input className="border rounded-md px-3 py-2" />
<span className="bg-success-100 text-success-700 rounded px-2 py-1">Badge</span>
```

---

### Shadows

| Element | Class | Use Case |
|---------|-------|----------|
| Standard Cards | `shadow-md` | Default elevation |
| Modals/Overlays | `shadow-lg` | Higher elevation |
| Dropdowns | `shadow-lg` | Floating elements |
| Hover Elevation | `hover:shadow-lg` | Interactive feedback |

**Examples:**
```typescript
<div className="bg-white rounded-xl shadow-md p-6">
  Standard Card
</div>

<div className="fixed inset-0 flex items-center justify-center">
  <div className="bg-white rounded-xl shadow-lg p-8">
    Modal Content
  </div>
</div>

<div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow">
  Hover to elevate
</div>
```

---

## Typography

### Fonts

| Type | Class | Font Family | Use Case |
|------|-------|-------------|----------|
| **UI Text** | `font-sans` | Inter | All UI text (default) |
| **Code** | `font-mono` | JetBrains Mono | Code blocks, JSON viewers |

**Examples:**
```typescript
// UI Text (default)
<p className="font-sans text-coolgray-600">
  This is standard UI text
</p>

// Code blocks (must use mono)
<pre className="font-mono bg-coolgray-900 text-white p-4 rounded-md">
  const hello = 'world'
</pre>

// Inline code
<code className="font-mono bg-coolgray-100 text-coolgray-700 px-2 py-1 rounded">
  useState
</code>
```

---

### Text Alignment

| Content Type | Alignment | Class | Reason |
|-------------|-----------|-------|--------|
| Text columns | Left | `text-left` | Natural reading flow |
| Numbers | Right | `text-right` | Scannability, easier comparison |
| Centered headings | Center | `text-center` | Visual hierarchy |

**Data Table Example:**
```typescript
<table className="w-full">
  <thead>
    <tr>
      <th className="text-left">Name</th>
      <th className="text-left">Status</th>
      <th className="text-right">Count</th>
      <th className="text-right">Revenue</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td className="text-left">Project A</td>
      <td className="text-left">Active</td>
      <td className="text-right">1,234</td>
      <td className="text-right">$56,789</td>
    </tr>
  </tbody>
</table>
```

---

## Common Patterns

### Button Styles

```typescript
// Primary Button
<button className="bg-primary-500 hover:bg-primary-600 active:bg-primary-700 focus:ring-2 focus:ring-secondary-500 text-white font-medium px-4 py-2 rounded-lg transition-colors">
  Primary Action
</button>

// Secondary Button
<button className="bg-white hover:bg-coolgray-50 active:bg-coolgray-100 border border-coolgray-200 text-coolgray-600 font-medium px-4 py-2 rounded-lg transition-colors">
  Secondary Action
</button>

// Danger Button
<button className="bg-danger-500 hover:bg-danger-600 active:bg-danger-700 focus:ring-2 focus:ring-danger-500 text-white font-medium px-4 py-2 rounded-lg transition-colors">
  Delete
</button>
```

### Card Styles

```typescript
// Standard Card
<div className="bg-white rounded-xl shadow-md p-6 border border-coolgray-200">
  <h3 className="text-lg font-semibold text-coolgray-600 mb-4">Card Title</h3>
  <p className="text-coolgray-500">Card content</p>
</div>

// Interactive Card
<div className="bg-white rounded-xl shadow-md hover:shadow-lg p-6 border border-coolgray-200 cursor-pointer transition-shadow">
  <h3 className="text-lg font-semibold text-coolgray-600 mb-4">Clickable Card</h3>
  <p className="text-coolgray-500">Hover to see elevation change</p>
</div>
```

### Form Inputs

```typescript
// Text Input
<input
  type="text"
  className="w-full border border-coolgray-200 rounded-md px-3 py-2 focus:border-secondary-500 focus:ring-2 focus:ring-secondary-500 focus:outline-none"
  placeholder="Enter text"
/>

// Textarea
<textarea
  className="w-full border border-coolgray-200 rounded-md px-3 py-2 focus:border-secondary-500 focus:ring-2 focus:ring-secondary-500 focus:outline-none"
  rows={4}
  placeholder="Enter description"
/>

// Select
<select className="w-full border border-coolgray-200 rounded-md px-3 py-2 focus:border-secondary-500 focus:ring-2 focus:ring-secondary-500 focus:outline-none">
  <option>Option 1</option>
  <option>Option 2</option>
</select>
```

---

## Summary Checklist

- [ ] Use theme colors from `tailwind.config.ts`, not default Tailwind colors
- [ ] Apply neutral palette (`coolgray`) for 90% of UI
- [ ] Use brand palettes for specific contexts (primary for actions, secondary for nav)
- [ ] Apply utility palettes for status messages
- [ ] Follow interaction state rules: hover=600, active=700, focus=ring
- [ ] Use 4-point grid for all spacing and sizing
- [ ] Apply correct border radius: cards=xl, buttons=lg, inputs=md
- [ ] Use appropriate shadows: cards=md, modals=lg
- [ ] Use `font-sans` for UI, `font-mono` for code
- [ ] Align numbers right in tables
