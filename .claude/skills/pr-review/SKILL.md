---
name: PR Review
description: Perform a thorough code review of a pull request. Use this skill when reviewing PRs, evaluating code changes, identifying issues, or providing feedback on proposed changes. Invoke with a PR URL or number. Use when the user asks to "review PR", "review pull request", "check this PR", "review my changes", or provides a GitHub PR URL or number. Use when running `gh pr` commands to inspect pull requests, when evaluating code diffs for bugs, security issues, or convention violations, when checking if changes follow TypeScript strict mode, proper error handling, and project patterns. Use when verifying that PRs address security concerns from the AppExchange Security Review Checklist including authentication, input validation, access control, and injection prevention. Use when assessing test coverage for changed functionality, when checking commit message format follows Conventional Commits, or when providing structured feedback with approve/request-changes verdicts.
---

## When to use this skill

- When the user asks to "review PR", "review pull request", "check this PR", or "review my changes"
- When the user provides a GitHub PR URL (e.g., `https://github.com/org/repo/pull/123`)
- When the user provides a PR number (e.g., "review PR #5", "look at pull request 42")
- When running `gh pr view`, `gh pr diff`, or other `gh pr` commands
- When evaluating code diffs for bugs, logic errors, or issues
- When checking if changes follow TypeScript strict mode (no `any` types)
- When verifying proper error handling and null/undefined checks
- When assessing test coverage for changed functionality
- When checking commit message format follows Conventional Commits
- When evaluating security implications of code changes
- When verifying changes follow the AppExchange Security Review Checklist
- When checking for hardcoded secrets, SQL injection, XSS, or OWASP vulnerabilities
- When reviewing authentication, session handling, or OAuth token changes
- When evaluating API endpoint changes for proper authorization and input validation
- When checking frontend changes for security issues (eval, innerHTML, localStorage secrets)
- When verifying RLS context is set for database operations
- When providing structured feedback with approve/request-changes/comment verdicts
- When the user wants to submit a review using `gh pr review`

# PR Review Prompt

Use this prompt to review a pull request. Replace `{PR_URL}` with the actual PR URL.

---

## Review Instructions

You are performing a code review for this pull request: `{PR_URL}`

### Step 1: Gather Context

1. Fetch the PR details using `gh pr view {PR_URL} --json title,body,files,additions,deletions,commits`
2. Get the diff: `gh pr diff {PR_URL}`
3. Review the project's CLAUDE.md for coding conventions

### Step 2: Review Checklist

Evaluate the PR against these criteria:

**Code Quality**
- [ ] Code is readable and self-documenting
- [ ] No unnecessary complexity or over-engineering
- [ ] Follows DRY principles without premature abstraction
- [ ] Proper error handling where appropriate

**TypeScript/JavaScript**
- [ ] No `any` types (strict mode compliance)
- [ ] Proper null/undefined handling
- [ ] Unused variables removed or prefixed with `_`
- [ ] Imports use `@` alias for src paths

**Testing**
- [ ] Tests cover the changed functionality
- [ ] Tests follow Arrange-Act-Assert pattern
- [ ] No flaky or timing-dependent tests

**Security (Reference: [AppExchange Security Review Checklist](../../../docs/security-review-materials/APPEXCHANGE-SECURITY-REVIEW-CHECKLIST.md))**

*Basic Checks (All PRs)*
- [ ] No hardcoded secrets or credentials (§4, §15)
- [ ] Input validation at system boundaries (§5, §9)
- [ ] No SQL injection, XSS, or other OWASP vulnerabilities (§5, §15)

*Authentication & Session (§6, §7) - If PR touches auth/session code*
- [ ] OAuth tokens stored securely (refresh tokens server-side only)
- [ ] Session cookies have Secure, HttpOnly, SameSite=None flags
- [ ] Token refresh flow handles failures gracefully

*Access Control (§5) - If PR touches API endpoints or data access*
- [ ] Authorization checked on every request (not just UI)
- [ ] RLS context set for all database operations
- [ ] No IDOR vulnerabilities (user owns requested resources)
- [ ] Principle of least privilege followed

*Data Protection (§8) - If PR handles sensitive data*
- [ ] Zero-data proxy pattern maintained (no MCE data persisted)
- [ ] No customer data in logs (masked if needed)
- [ ] Encryption used for sensitive data at rest

*API Security (§9) - If PR adds/modifies API endpoints*
- [ ] Zod validation on all request inputs
- [ ] Rate limiting considered for new endpoints
- [ ] CSRF tokens required for state-changing operations
- [ ] Generic error messages (no stack traces to clients)
- [ ] SSRF prevention for outbound requests (host allowlist)

*Frontend Security (§10) - If PR modifies frontend code*
- [ ] No eval() or innerHTML with user data
- [ ] No sensitive data in localStorage
- [ ] CSP-compatible (no inline scripts/styles without nonces)
- [ ] Cookie handling follows SameSite=None requirements

*Injection Prevention (§5, §15) - If PR touches database/MCE calls*
- [ ] Parameterized queries (no string concatenation in SQL)
- [ ] XML/SOAP values properly escaped for MCE calls
- [ ] User input sanitized before use

*Logging (§12) - If PR adds logging*
- [ ] No secrets/tokens/PII in log output
- [ ] Correlation IDs included for traceability
- [ ] Access control failures logged

**Project Conventions**
- [ ] Follows commit message format (Conventional Commits)
- [ ] File organization matches project structure
- [ ] State management follows guidelines (useState → Zustand → TanStack Query)

### Step 3: Provide Feedback

Structure your review as:

```markdown
## Summary
Brief overview of what the PR accomplishes and overall assessment.

## Strengths
What the PR does well.

## Issues Found
### Critical (must fix)
- Issue description with file:line reference

### Suggestions (nice to have)
- Improvement suggestion with rationale

## Questions
Any clarifications needed from the author.

## Verdict
- [ ] Approve
- [ ] Request Changes
- [ ] Comment Only
```

### Step 4: Submit Review

Use `gh pr review {PR_URL} --approve/--request-changes/--comment --body "..."` to submit.

---

## Example Usage

```bash
# Review PR #5
gh pr view 5 --json title,body,files
gh pr diff 5
# Then provide structured feedback
```
