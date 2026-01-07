# Build Tools and Configuration

## Build System

### Vite
This project uses **Vite** as its build tool and dev server.

**Benefits:**
- Instant server start with native ESM
- Lightning-fast Hot Module Replacement (HMR)
- Optimized production builds with Rollup
- Built-in TypeScript support

**Key Commands:**
```bash
npm run dev          # Start development server
npm run build        # Production build
npm run preview      # Preview production build
npm run type-check   # Run TypeScript compiler without emitting files
```

---

## Path Aliases

### Configuration
Use absolute path aliases in all imports to simplify and standardize import statements.

**Configured Aliases:**
```typescript
@/              → client/src/
@shared         → shared/
@components     → client/src/components/
@features       → client/src/features/
@hooks          → client/src/hooks/
@utils          → client/src/utils/
@types          → client/src/types/
```

### Usage

```typescript
✅ REQUIRED:
import { Button } from '@/components/ui/Button'
import { usePipeline } from '@/features/pipeline'
import { validateEmail } from '@/utils/validation'

❌ AVOID:
import { Button } from '../../../components/ui/Button'
import { usePipeline } from '../../features/pipeline'
import { validateEmail } from '../../../utils/validation'
```

**Why:**
- Easier to refactor (moving files doesn't break imports)
- More readable
- Consistent across the codebase
- IDE autocomplete works better

### Setup Files
- `tsconfig.json` - TypeScript path mapping
- `vite.config.ts` - Vite alias resolution

---

## Quality Checks

### Pre-Commit Hooks (lint-staged)
Managed by `lint-staged`, these run automatically on `git commit`:

1. **ESLint** - Checks code quality and standards
2. **Prettier** - Formats code consistently

**Configuration:**
```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

**What Happens:**
- Only staged files are checked
- Automatically fixes issues where possible
- Blocks commit if unfixable errors exist

### Build Checker Hook
The `build-checker.mjs` hook runs TypeScript type checking:

**Runs:**
```bash
tsc --noEmit
```

**When It Runs:**
- After significant code changes
- Before commits (in some configurations)

**What to Do:**
- Fix all reported TypeScript errors immediately
- Do not commit code with type errors
- Review error messages carefully

**Common Issues:**
```typescript
❌ Type 'string | undefined' is not assignable to type 'string'
✅ Fix: Use optional chaining or provide default value

❌ Property 'foo' does not exist on type 'Bar'
✅ Fix: Add property to type definition or use type guard
```

---

## Development Workflow

### Standard Workflow
```bash
# 1. Start development server
npm run dev

# 2. Make changes, test in browser
# (HMR updates automatically)

# 3. Before committing, verify everything passes
npm run type-check    # TypeScript types
npm run lint          # ESLint rules
npm run test          # Test suite
npm run build         # Production build

# 4. Commit (hooks run automatically)
git add .
git commit -m "description"
```

### Troubleshooting Build Issues

**Issue: Build fails with module resolution error**
```bash
Solution: Check path aliases in tsconfig.json and vite.config.ts
```

**Issue: Type errors only in build, not in IDE**
```bash
Solution: Restart TypeScript server in IDE
VSCode: Cmd+Shift+P → "TypeScript: Restart TS Server"
```

**Issue: Vite dev server shows blank page**
```bash
Solution: Check browser console for errors
Often: Missing environment variables or API endpoint issues
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite build configuration, path aliases, plugins |
| `tsconfig.json` | TypeScript compiler options and path mapping |
| `.eslintrc.cjs` | ESLint rules and configuration |
| `.prettierrc` | Prettier formatting rules |
| `package.json` | Scripts, dependencies, lint-staged config |

---

## Summary

| Tool | Purpose | When It Runs |
|------|---------|--------------|
| Vite | Build & dev server | `npm run dev`, `npm run build` |
| TypeScript | Type checking | `npm run type-check`, on save (IDE) |
| ESLint | Code quality | Pre-commit, `npm run lint` |
| Prettier | Code formatting | Pre-commit, `npm run format` |
| lint-staged | Pre-commit hooks | On `git commit` |
| build-checker | Type verification | After code changes |
