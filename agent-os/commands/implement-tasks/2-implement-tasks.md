Now that you have the task group(s) to be implemented, proceed with implementation by following these instructions:

Implement all tasks assigned to you and ONLY those task(s) that have been assigned to you.

## Implementation process:

1. **Load required standards** (see Step 0 below - CRITICAL)
2. Analyze the provided spec.md, requirements.md, and visuals (if any)
3. Analyze patterns in the codebase according to its built-in workflow
4. Implement the assigned task group according to requirements and standards
5. **Verify your implementation** (see verification checklist below)
6. **Fix any issues found** during verification before proceeding
7. Update `agent-os/specs/[this-spec]/tasks.md` to update the tasks you've implemented to mark that as done by updating their checkbox to checked state: `- [x]`

## Step 0: Load Required Standards (BEFORE Implementation)

**CRITICAL:** You MUST invoke the relevant skills using the **Skill tool** BEFORE starting implementation. This ensures your code will pass review on the first attempt.

### How to Invoke Skills

For each skill name listed below, use the **Skill tool** with that exact name as the command parameter.

### Always Invoke (Universal Standards)

Use the Skill tool to invoke these skills for EVERY implementation task:

```
global-coding-style
global-naming
global-linting
global-security
global-commenting
global-error-handling
```

### Invoke Based on Task Type

Read your assigned task(s) in `tasks.md`, then use the Skill tool to invoke the relevant skills:

**If implementing React/Frontend components:**
```
frontend-component-design
frontend-components
frontend-css
frontend-styling
frontend-state-management
frontend-accessibility
```

**If implementing responsive UI:**
```
frontend-responsive
```

**If implementing React Flow/Canvas features:**
```
frontend-canvas-performance
```

**If implementing tests:**
```
testing-universal-factory-patterns
testing-universal-test-structure
testing-universal-tdd-philosophy
testing-typescript-type-safety
testing-universal-assertions
```

**If implementing UI/component tests:**
```
testing-frontend-ui-testing
testing-react-component-testing
```

**If implementing hook tests:**
```
testing-react-hook-testing
```

**If implementing backend/API work:**
```
backend-api
backend-models
backend-queries
```

**If implementing database migrations:**
```
backend-migrations
```

### After Loading Standards

Once skills are loaded via the Skill tool, proceed with implementation while actively following their guidance. These loaded standards are the SAME standards that `/review-staged-files` will check against.

## Guide your implementation using:
- **The loaded standards** from skills invoked in Step 0 (PRIMARY source of truth)
- **The existing patterns** that you've found and analyzed in the codebase
- **Specific notes provided in requirements.md, spec.md AND/OR tasks.md**
- **Visuals provided (if any)** which would be located in `agent-os/specs/[this-spec]/planning/visuals/`

## Verification Checklist (Run After Each Implementation)

**IMPORTANT:** After implementing each task, you MUST verify your work and FIX any issues before marking the task complete. This ensures quality and prevents accumulation of technical debt.

### Step 1: Run Automated Checks (BLOCKING - Must Pass)

Run these commands and fix ALL errors before proceeding:

```bash
# Check for TypeScript errors
npx tsc --noEmit

# Check for linting errors
npm run lint
```

**Critical:** TypeScript and lint errors are BLOCKING issues. You MUST fix them immediately. Do not proceed until these commands show 0 errors.

### Step 2: Run Tests (BLOCKING - Must Pass)

```bash
# Run ONLY the tests you wrote for this implementation
npm test [test-file-pattern]
```

**Critical:** All tests you wrote MUST pass. Fix any failing tests before proceeding.

### Step 3: Verify Against Code Standards Checklist

Review your implementation against these standards. If ANY item fails, reference the corresponding skill and fix the issue:

**General Code Quality:**
- [ ] No obvious bugs or logic errors (null checks, async/await, conditionals)
- [ ] Follows naming conventions (see: `global-naming` skill if unclear)
- [ ] No security issues (XSS, insecure storage, hardcoded secrets - see: `global-security` skill)
- [ ] No type escape hatches (`@ts-ignore`, `any`, `as unknown as` - see: `global-linting` skill)
- [ ] Functions follow Single Responsibility Principle (see: `global-coding-style` skill)
- [ ] No dead code or commented-out code

**Component-Specific (if implementing React components):**
- [ ] Follows Single Responsibility Principle (see: `frontend-component-design` skill)
- [ ] Proper state management tier (useState/Zustand/TanStack Query - see: `frontend-state-management` skill)
- [ ] React Flow components use React.memo and useCallback (see: `frontend-canvas-performance` skill)
- [ ] Component exported via barrel index file (index.ts)
- [ ] Semantic HTML with ARIA attributes (see: `frontend-accessibility` skill)
- [ ] Tailwind CSS used, minimal custom CSS (see: `frontend-css` skill)

**Test-Specific (if writing tests):**
- [ ] Using centralized factories from `test-utils/factories` (see: `testing-universal-factory-patterns` skill)
- [ ] Factory reset in `beforeEach()` with `resetAllFactories()`
- [ ] Test naming: `MethodName_StateUnderTest_ExpectedBehavior` (see: `testing-universal-test-structure` skill)
- [ ] AAA pattern with clear comments (Arrange, Act, Assert)
- [ ] Single Act per test
- [ ] Semantic queries used (`getByRole`, `getByText` - see: `testing-frontend-ui-testing` skill)
- [ ] Edge cases covered (null, empty, boundaries, errors)
- [ ] No mock leakage between tests

### Step 4: Fix Issues Immediately

**IF you find ANY violations in Step 3:**

1. Reference the specific skill mentioned in brackets
2. Fix the issue in your implementation
3. Re-run Steps 1-2 (TypeScript, lint, tests)
4. Re-check the violated item in Step 3

**Repeat until ALL items pass.**

### Step 5: UI Testing (If Applicable)

IF your task involves user-facing UI, and IF you have access to browser testing tools:

1. Open a browser and use the feature you've implemented as if you are a user
2. Ensure a user can use the feature in the intended way
3. Take screenshots of the views and UI elements you've tested
4. Store screenshots in `agent-os/specs/[this-spec]/verification/screenshots/`
5. Analyze the screenshot(s) against your requirements

## Common Issues to Watch For

While implementing, actively look for and prevent these issues:

**Async/Await Issues:**
- Unhandled promise rejections
- Missing `await` keywords
- Race conditions

**Null/Undefined Handling:**
- Potential null pointer errors
- Missing null checks
- Unsafe property access (use optional chaining)

**Logic Errors:**
- Off-by-one errors in loops
- Incorrect conditional logic
- High cyclomatic complexity (deeply nested ifs)

**Intent Mismatch:**
- Code doesn't match requirements or comments
- Misleading variable names
- Unexpected side effects


## Display confirmation and next step

Display a summary of what was implemented.

IF all tasks are now marked as done (with `- [x]`) in tasks.md, display this message to user:

```
All tasks have been implemented: `agent-os/specs/[this-spec]/tasks.md`.

NEXT STEP 👉 Run `3-verify-implementation.md` to verify the implementation.
```

IF there are still tasks in tasks.md that have yet to be implemented (marked unfinished with `- [ ]`) then display this message to user:

```
Would you like to proceed with implementation of the remaining tasks in tasks.md?

If not, please specify which task group(s) to implement next.
```

## User Standards & Preferences Compliance

IMPORTANT: Ensure that the tasks list is ALIGNED and DOES NOT CONFLICT with the user's preferences and standards as detailed in the following files:

@agent-os/standards//backend/api.md
@agent-os/standards//backend/migrations.md
@agent-os/standards//backend/models.md
@agent-os/standards//backend/queries.md
@agent-os/standards//frontend/accessibility.md
@agent-os/standards//frontend/canvas-performance.md
@agent-os/standards//frontend/component-design.md
@agent-os/standards//frontend/components.md
@agent-os/standards//frontend/css.md
@agent-os/standards//frontend/responsive.md
@agent-os/standards//frontend/state-management.md
@agent-os/standards//frontend/styling.md
@agent-os/standards//global/architecture.md
@agent-os/standards//global/build-tools.md
@agent-os/standards//global/coding-style.md
@agent-os/standards//global/commenting.md
@agent-os/standards//global/conventions.md
@agent-os/standards//global/error-handling.md
@agent-os/standards//global/linting.md
@agent-os/standards//global/naming.md
@agent-os/standards//global/security.md
@agent-os/standards//global/tech-stack.md
@agent-os/standards//global/validation.md
@agent-os/standards//testing/frontend/ui-testing.md
@agent-os/standards//testing/react/component-testing.md
@agent-os/standards//testing/react/hook-testing.md
@agent-os/standards//testing/test-writing.md
@agent-os/standards//testing/typescript/type-safety.md
@agent-os/standards//testing/universal/assertions.md
@agent-os/standards//testing/universal/factory-patterns.md
@agent-os/standards//testing/universal/migration.md
@agent-os/standards//testing/universal/tdd-philosophy.md
@agent-os/standards//testing/universal/test-structure.md
@agent-os/standards//testing/vitest/api-reference.md
