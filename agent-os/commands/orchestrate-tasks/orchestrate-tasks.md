# Process for Orchestrating a Spec's Implementation

Now that we have a spec and tasks list ready for implementation, we will proceed with orchestrating implementation of each task group by a dedicated agent using the following MULTI-PHASE process.

Follow each of these phases and their individual workflows IN SEQUENCE:

## Multi-Phase Process

### FIRST: Get tasks.md for this spec

IF you already know which spec we're working on and IF that spec folder has a `tasks.md` file, then use that and skip to the NEXT phase.

IF you don't already know which spec we're working on and IF that spec folder doesn't yet have a `tasks.md` THEN output the following request to the user:

```
Please point me to a spec's `tasks.md` that you want to orchestrate implementation for.

If you don't have one yet, then run any of these commands first:
/shape-spec
/write-spec
/create-tasks
```

### NEXT: Create orchestration.yml to serve as a roadmap for orchestration of task groups

In this spec's folder, create this file: `agent-os/specs/[this-spec]/orchestration.yml`.

Populate this file with with the names of each task group found in this spec's `tasks.md` and use this EXACT structure for the content of `orchestration.yml`:

```yaml
task_groups:
  - name: [task-group-name]
  - name: [task-group-name]
  - name: [task-group-name]
  # Repeat for each task group found in tasks.md
```


### NEXT: Ask user to assign standards to each task group

Next we must determine which standards should guide the implementation of each task group.  Ask the user to provide this info using the following request to user and WAIT for user's response:

```
Please specify the standard(s) that should be used to guide the implementation of each task group:

1. [task-group-name]
2. [task-group-name]
3. [task-group-name]
[repeat for each task-group you've added to orchestration.yml]

For each task group number, you can specify any combination of the following:

"all" to include all of your standards
"global/*" to include all of the files inside of standards/global
"frontend/css.md" to include the css.md standard file
"none" to include no standards for this task group.
```

Using the user's responses, update `orchestration.yml` to specify those standards for each task group.  `orchestration.yml` should end up having AT LEAST the following information added to it:

```yaml
task_groups:
  - name: [task-group-name]
    standards:
      - [users' 1st response for this task group]
      - [users' 2nd response for this task group]
      - [users' 3rd response for this task group]
      # Repeat for all standards that the user specified for this task group
  - name: [task-group-name]
    standards:
      - [users' 1st response for this task group]
      - [users' 2nd response for this task group]
      # Repeat for all standards that the user specified for this task group
  # Repeat for each task group found in tasks.md
```

For example, after this step, the `orchestration.yml` file might look like this (exact names will vary):

```yaml
task_groups:
  - name: authentication-system
    standards:
      - all
  - name: user-dashboard
    standards:
      - global/*
      - frontend/components.md
      - frontend/css.md
  - name: task-group-with-no-standards
  - name: api-endpoints
    standards:
      - backend/*
      - global/error-handling.md
```

Note: If the `use_claude_code_subagents` flag is enabled, the final `orchestration.yml` would include BOTH `claude_code_subagent` assignments AND `standards` for each task group.


### NEXT: Generate prompts

Now we must generate an ordered series of prompt texts, which will be used to direct the implementation of each task group listed in `orchestration.yml`.

Follow these steps to generate this spec's ordered series of prompts texts, each in its own .md file located in `agent-os/specs/[this-spec]/implementation/prompts/`.

LOOP through EACH task group in `agent-os/specs/[this-spec]/tasks.md` and for each, use the following workflow to generate a markdown file with prompt text for each task group:

#### Step 1. Create the prompt markdown file

Create the prompt markdown file using this naming convention:
`agent-os/specs/[this-spec]/implementation/prompts/[task-group-number]-[task-group-title].md`.

For example, if the 3rd task group in tasks.md is named "Comment System" then create `3-comment-system.md`.

#### Step 2. Populate the prompt file

Populate the prompt markdown file using the following Prompt file content template.

##### Bracket content replacements

In the content template below, replace "[spec-title]" and "[this-spec]" with the current spec's title, and "[task-group-number]" with the current task group's number.

To replace "[orchestrated-standards]", use the following workflow:

#### Compile Implementation Standards

Use the following logic to compile a list of file references to standards that should guide implementation:

##### Steps to Compile Standards List

1. Find the current task group in `orchestration.yml`
2. Check the list of `standards` specified for this task group in `orchestration.yml`
3. Compile the list of file references to those standards, one file reference per line, using this logic for determining which files to include:
   a. If the value for `standards` is simply `all`, then include every single file, folder, sub-folder and files within sub-folders in your list of files.
   b. If the item under standards ends with "*" then it means that all files within this folder or sub-folder should be included. For example, `frontend/*` means include all files and sub-folders and their files located inside of `agent-os/standards/frontend/`.
   c. If a file ends in `.md` then it means this is one specific file you must include in your list of files. For example `backend/api.md` means you must include the file located at `agent-os/standards/backend/api.md`.
   d. De-duplicate files in your list of file references.

##### Output Format

The compiled list of standards should look something like this, where each file reference is on its own line and begins with `@`. The exact list of files will vary:

```
@agent-os/standards/global/coding-style.md
@agent-os/standards/global/conventions.md
@agent-os/standards/global/tech-stack.md
@agent-os/standards/backend/api/authentication.md
@agent-os/standards/backend/api/endpoints.md
@agent-os/standards/backend/api/responses.md
@agent-os/standards/frontend/css.md
@agent-os/standards/frontend/responsive.md
```


#### Prompt file content template:

```markdown
We're continuing our implementation of [spec-title] by implementing task group number [task-group-number]:

## Implement this task and its sub-tasks:

[paste entire task group including parent task, all of its' sub-tasks, and sub-bullet points]

## Understand the context

Read @agent-os/specs/[this-spec]/spec.md to understand the context for this spec and where the current task fits into it.

Also read these further context and reference:
- @agent-os/specs/[this-spec/]/planning/requirements.md
- @agent-os/specs/[this-spec/]/planning/visuals

## Perform the implementation

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


## User Standards & Preferences Compliance

IMPORTANT: Ensure that your implementation work is ALIGNED and DOES NOT CONFLICT with the user's preferences and standards as detailed in the following files:

[orchestrated-standards]
```

### Step 3: Output the list of created prompt files

Output to user the following:

```
Ready to begin implementation of [spec-title]!

Use the following list of prompts to direct the implementation of each task group:

[list prompt files in order]

Input those prompts into this chat one-by-one or queue them to run in order.

Progress will be tracked in `agent-os/specs/[this-spec]/tasks.md`
```
