---
name: PR Review
description: Perform a thorough code review of a pull request. Use this skill when reviewing PRs, evaluating code changes, identifying issues, or providing feedback on proposed changes. Invoke with a PR URL or number. Use when the user asks to "review PR", "review pull request", "check this PR", "review my changes", or provides a GitHub PR URL or number. Use when running `gh pr` commands to inspect pull requests, when evaluating code diffs for bugs, security issues, or convention violations, when checking if changes follow TypeScript strict mode, proper error handling, and project patterns. Use when verifying that PRs address security concerns from the AppExchange Security Review Checklist including authentication, input validation, access control, and injection prevention. Use when assessing test coverage for changed functionality, when checking commit message format follows Conventional Commits, or when providing structured feedback with approve/request-changes verdicts.
---

## When to use this skill

- When the user asks to "review PR", "review pull request", "check this PR", or "review my changes"
- When the user provides a GitHub PR URL (e.g., `https://github.com/org/repo/pull/123`)
- When the user provides a PR number (e.g., "review PR #5", "look at pull request 42")
- When running `gh pr view`, `gh pr diff`, or other `gh pr` commands
- When the user wants to submit a review using `gh pr review`

# PR Review Prompt

Use this prompt to review a pull request. Replace `{PR_URL}` with the actual PR URL.

---

## Review Philosophy

**CRITICAL:** Your goal is to catch real bugs and security issues, NOT to find something wrong with every PR. If the code is solid, say so. An empty "Issues Found" section is a valid and expected outcome for well-written code.

### Priority Order (flag these)

1. **Security vulnerabilities** - injection, auth bypass, data exposure, secrets
2. **Logic bugs** - code that will produce incorrect behavior
3. **Edge cases** - unhandled scenarios that will crash or corrupt data
4. **Missing test coverage** - new/changed behavior with no tests (see Step 2.5)

### Do NOT Flag

- Style preferences unless they violate explicit CLAUDE.md conventions
- Theoretical issues without concrete, demonstrable impact
- Things that "could be better" but work correctly
- Naming opinions unless the name is actively misleading
- Minor formatting inconsistencies
- "Consider adding..." suggestions without clear value

### Before Including Any Issue, Ask Yourself

1. Could this cause incorrect behavior or a security vulnerability?
2. Is there genuine ambiguity or a real bug, or am I speculating?
3. Would a senior engineer at this company flag this in a real review?

**Flag if ANY answer is "yes" or "uncertain."**

### When In Doubt, Flag It

If you're uncertain whether something is a real issue:
- Flag it as "Medium" or "Clarification Needed" (not Critical)
- Phrase as a question: "Is X intended to handle Y case?"
- Let the author confirm or clarify

Err toward flagging genuine concerns, not toward silence. But do not manufacture issues.

---

## Review Instructions

You are performing a code review for this pull request: `{PR_URL}`

### Step 1: Gather Context

1. Fetch PR details: `gh pr view {PR_URL} --json title,body,files,additions,deletions,commits`
2. Get the diff: `gh pr diff {PR_URL}`
3. Review CLAUDE.md for project conventions

### Step 2: Focused Review Checklist

**Must Check (every PR):**

- [ ] Does this introduce a security vulnerability? (injection, auth bypass, data exposure, hardcoded secrets)
- [ ] Is there a logic bug that will cause wrong behavior?
- [ ] Are there unhandled edge cases that could crash or corrupt data?
- [ ] Does changed behavior have test coverage? (see Step 2.5)

**Check If PR Touches These Areas:**

| Area | Key Concerns | Checklist Reference |
|------|--------------|---------------------|
| Auth/Session | OAuth tokens server-side only, secure cookie flags, token refresh error handling | §6, §7 |
| Database | RLS context set, parameterized queries, no SQL concatenation | §5, §11 |
| API Endpoints | Input validation (Zod), authorization on every request, no IDOR | §5, §9 |
| Frontend | No eval()/innerHTML with user data, no secrets in localStorage | §10 |
| MCE Calls | XML/SOAP values escaped, no data persistence (zero-data proxy) | §7, §9 |
| Logging | No secrets/PII in logs | §12 |

**Reference:** [AppExchange Security Review Checklist](../../../docs/security-review-materials/APPEXCHANGE-SECURITY-REVIEW-CHECKLIST.md)

### Step 2.5: Evaluate Test Coverage

**Do NOT just ask "where are the tests?"** Actively verify coverage:

1. **Identify what changed** - List files/functions with new or modified behavior
2. **Search for existing tests** - For each changed file `src/path/file.ts`:
   - Look for `src/path/file.spec.ts`, `src/path/file.test.ts`
   - Grep test files for imports/references to the modified functions
   - Check if existing tests exercise the changed code paths
3. **Evaluate coverage**:
   - ✅ **OK:** Tests exist (in PR or codebase) that cover the changed behavior
   - ✅ **OK:** Refactoring with no behavior change, existing tests still pass
   - ⚠️ **Flag:** New functionality with no tests anywhere
   - ⚠️ **Flag:** Behavior change with no tests covering the new behavior

### Step 3: Provide Feedback

Structure your review as:

```markdown
## Summary

Brief overview of what the PR accomplishes and overall assessment.

## Strengths

What the PR does well. (Skip if nothing notable stands out.)

## Issues Found

### Critical (must fix before merge)

- **[file:line]** Issue description
  - **Impact:** What breaks / what's exposed / who's affected
  - **Confidence:** High
  - **Fix:** Concrete suggestion

### Medium (should fix)

- **[file:line]** Issue description
  - **Impact:** Explanation of real-world consequence
  - **Confidence:** High/Medium
  - **Fix:** Concrete suggestion

*(If no issues found, write: "No issues found. Code looks solid.")*

### Suggestions (truly optional)

Only include if you can articulate concrete value. Limit to 1-2 max.

- **[file:line]** Suggestion with clear rationale

## Questions

Clarifications needed from the author. (Skip if none.)

## Verdict

**Approve** / **Request Changes** / **Comment Only**
```

### Step 4: Submit Review

```bash
gh pr review {PR_URL} --approve --body "..."
gh pr review {PR_URL} --request-changes --body "..."
gh pr review {PR_URL} --comment --body "..."
```

---

## Valid Review Outcomes

These are all legitimate results of a good review:

- "No critical issues found. Code looks solid." → **Approve**
- "One security concern worth addressing, otherwise good." → **Request Changes**
- "Minor suggestions only, nothing blocking." → **Approve** with comments
- Zero issues, zero suggestions → **Approve**

Do not manufacture feedback to appear thorough. Silence on an issue means it passed review.
