---
name: Plan Review
description: Review Claude Code implementation plans to ensure they're ready for execution. Validates completeness, specificity, security, and implementability of plans before coding begins. Use this skill after creating a plan in plan mode and before calling ExitPlanMode, when reviewing plan files or implementation outlines, when the user asks to "review my plan", "check the plan", or "validate the implementation approach", when analyzing multi-step implementation strategies for completeness, when checking if a plan has proper step ordering and dependencies, when verifying security considerations are addressed in implementation plans, when looking for vague instructions like "handle edge cases" or "follow best practices" that need to be made specific, or when assessing whether a plan reuses existing code appropriately and avoids over-engineering.
---

## When to use this skill

- After drafting a plan in Claude Code's plan mode (before calling ExitPlanMode)
- When reviewing plan files, implementation outlines, or step-by-step instructions
- When the user asks to "review my plan", "check the plan", or "validate the approach"
- Before executing a multi-step implementation plan
- When analyzing implementation strategies for completeness and clarity
- When checking if a plan has proper step ordering and dependencies
- When verifying that security considerations are addressed (auth, validation, data handling)
- When looking for vague instructions that need to be made specific
- When assessing whether a plan properly reuses existing code
- When validating that each step is verifiable and has clear success criteria
- To catch issues before implementation wastes effort
- When reviewing plans created by other agents or sessions
- When the user presents a numbered list of implementation steps to validate
- When checking for anti-patterns like missing file paths or circular dependencies
- When ensuring plans reference the AppExchange Security Review Checklist for security-sensitive features

# Plan Review Prompt

Use this prompt to review a Claude Code implementation plan.

---

## Review Instructions

You are reviewing an implementation plan to ensure it's ready for execution by an AI coding agent.

### Step 1: Gather Plan Contents

1. Read the plan file (typically specified in plan mode, or provided by user)
2. Read CLAUDE.md for project conventions
3. Identify the scope: What files/features will be touched?

### Step 2: Structural Completeness

Verify the plan has these essential elements:

**Problem Statement**
- [ ] Clear description of what's being built or fixed
- [ ] User-facing impact explained (why does this matter?)
- [ ] Success criteria defined (how do we know it's done?)

**Implementation Steps**
- [ ] Numbered or clearly ordered steps
- [ ] Each step is a discrete, verifiable action
- [ ] Dependencies between steps are clear
- [ ] No circular dependencies

**File References**
- [ ] Specific files to create/modify are listed
- [ ] File paths are absolute or clearly resolvable
- [ ] Existing code to reference/reuse is identified

**Testing Approach**
- [ ] How to verify each step works
- [ ] What tests to run (or write)
- [ ] Expected outcomes stated

### Step 3: Specificity & Clarity

Validate the plan is specific enough for autonomous execution:

**No Vague Instructions**
- [ ] No "implement best practices" without specifics
- [ ] No "handle edge cases" without listing them
- [ ] No "similar to X" without explaining the differences
- [ ] No "make it performant" without measurable targets

**Concrete Actions**
- [ ] Each step describes WHAT to do, not just THAT something should be done
- [ ] Function/component names are specified where relevant
- [ ] Data structures and types are defined
- [ ] API contracts (request/response shapes) are documented

**Checkable Criteria**
For each step, ask: "Can I verify this is done correctly?"
- [ ] All steps have binary pass/fail verification
- [ ] No subjective quality assessments ("looks good")
- [ ] Commands to run for verification are specified

### Step 4: Dependency & Ordering Analysis

Validate the execution order makes sense:

**Dependency Graph**
- [ ] Steps that depend on others are ordered after their dependencies
- [ ] Parallel-executable steps are identified (if applicable)
- [ ] Database migrations come before code that uses new schema
- [ ] Types/interfaces defined before implementations

**Build Sequence**
- [ ] Infrastructure before features (DB, config, etc.)
- [ ] Backend before frontend (if frontend depends on API)
- [ ] Tests written at appropriate points (TDD or after)
- [ ] Verification steps after implementation steps

**Critical Path**
- [ ] Most important/risky steps identified
- [ ] Blocking dependencies are minimal
- [ ] Early validation of assumptions

### Step 5: Security Review

**Reference:** [AppExchange Security Review Checklist](../../../docs/security-review-materials/APPEXCHANGE-SECURITY-REVIEW-CHECKLIST.md)

Check if the plan addresses security concerns for touched areas:

**Authentication & Authorization (§5, §6, §7)**
- [ ] If touching auth: OAuth flows, session handling, token storage addressed
- [ ] If adding endpoints: Authorization checks planned
- [ ] If multi-tenant: RLS context requirements specified

**Input Validation (§5, §9)**
- [ ] If accepting user input: Validation approach specified (Zod, etc.)
- [ ] If database queries: Parameterization confirmed
- [ ] If MCE API calls: SOAP/XML escaping addressed

**Data Handling (§8)**
- [ ] If handling sensitive data: Encryption requirements noted
- [ ] If logging: PII/secrets exclusion planned
- [ ] Zero-data proxy pattern maintained (if applicable)

**Frontend Security (§10)**
- [ ] If UI changes: No eval(), innerHTML with user data
- [ ] If cookies: SameSite, Secure, HttpOnly considered
- [ ] If storing data: No secrets in localStorage

**Plan Security Classification**
| Classification | Criteria |
|----------------|----------|
| 🟢 Low Risk | No auth, no user input, no data storage changes |
| 🟡 Medium Risk | New endpoints, form inputs, or data access patterns |
| 🔴 High Risk | Auth changes, MCE API integration, multi-tenant logic |

### Step 6: Reusability & Over-Engineering Check

**Existing Code Leverage**
- [ ] Plan references existing patterns/components to reuse
- [ ] Not recreating functionality that already exists
- [ ] Follows established project conventions

**Scope Creep**
- [ ] Plan only includes what was requested
- [ ] No "while we're at it" additions
- [ ] No premature abstractions
- [ ] No unnecessary new files/components

**Test Scope**
- [ ] Tests focused on new/changed functionality
- [ ] Not planning exhaustive coverage of existing code
- [ ] Integration tests for critical paths only

### Step 7: Provide Structured Feedback

Structure your review as:

```markdown
## Plan Review: [Brief Title]

### Summary
One paragraph describing what the plan accomplishes and overall assessment.

### Readiness Score: X/10
- 9-10: Ready for immediate execution
- 7-8: Minor clarifications needed
- 5-6: Significant gaps require revision
- <5: Plan needs major rework

### Structural Assessment
| Element | Status | Notes |
|---------|--------|-------|
| Problem statement | ✅/⚠️/❌ | ... |
| Implementation steps | ✅/⚠️/❌ | ... |
| File references | ✅/⚠️/❌ | ... |
| Testing approach | ✅/⚠️/❌ | ... |

### Specificity Assessment
| Criterion | Status | Notes |
|-----------|--------|-------|
| No vague instructions | ✅/⚠️/❌ | ... |
| Concrete actions | ✅/⚠️/❌ | ... |
| Checkable criteria | ✅/⚠️/❌ | ... |

### Dependency Analysis
| Check | Status |
|-------|--------|
| Correct ordering | ✅/⚠️/❌ |
| Clear dependencies | ✅/⚠️/❌ |
| Parallelization opportunities | ✅/⚠️/❌ |

### Security Assessment
*Reference: AppExchange Security Review Checklist*

**Risk Level:** 🟢 Low / 🟡 Medium / 🔴 High

| Area | Applicable? | Addressed? | Checklist §§ |
|------|-------------|------------|--------------|
| Auth/Session | Y/N | ✅/⚠️/❌/N/A | §5, §6, §7 |
| Input Validation | Y/N | ✅/⚠️/❌/N/A | §5, §9 |
| Data Protection | Y/N | ✅/⚠️/❌/N/A | §8 |
| Frontend Security | Y/N | ✅/⚠️/❌/N/A | §10 |

### Issues Found

#### Critical (Must Fix)
- Issue with specific location in plan
- Suggested resolution

#### Warnings (Should Fix)
- Issue description
- Impact if not addressed

#### Suggestions (Optional)
- Improvement idea

### Missing Elements
Things the plan should include but doesn't:
- [ ] Missing element 1
- [ ] Missing element 2

### Questions for Clarification
Questions that need answers before execution:
1. Question 1?
2. Question 2?

### Verdict
- [ ] ✅ Approved for Execution
- [ ] ⚠️ Needs Revision (see Critical/Warning issues)
- [ ] ❌ Needs Major Rework
```

---

## Quick Checklist (TL;DR)

For rapid plan validation, check these essentials:

```markdown
## Quick Plan Review

**Structure**
- [ ] Problem is clearly stated
- [ ] Steps are numbered and ordered
- [ ] File paths are specific
- [ ] Success criteria defined

**Specificity**
- [ ] Each step says WHAT to do, not just THAT to do it
- [ ] No vague terms ("best practices", "handle edge cases")
- [ ] Can verify each step is complete

**Dependencies**
- [ ] Steps in correct order
- [ ] No step uses something created in a later step

**Security** (if applicable)
- [ ] Auth/authz addressed for new endpoints
- [ ] Input validation planned
- [ ] No secrets in logs/localStorage

**Scope**
- [ ] Only what was requested
- [ ] Reuses existing code where possible
- [ ] Tests are focused, not exhaustive

**Verdict:** Ready / Needs Work / Major Issues
```

---

## Common Plan Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| "Implement the feature" | No breakdown of steps | List specific actions |
| "Add proper error handling" | What errors? What handling? | List specific error cases and responses |
| "Follow existing patterns" | Which patterns? Where? | Reference specific file paths |
| "Update tests" | Which tests? What assertions? | List test files and new test cases |
| "Refactor for cleanliness" | Subjective, no end state | Define specific refactoring actions |
| "Handle all edge cases" | Unknown scope | List specific edge cases to handle |
| "Make it secure" | No specific security measures | Reference checklist sections |
| "Optimize performance" | No measurable target | Define metrics and targets |
| Step 3 uses result of Step 5 | Wrong order | Reorder based on dependencies |
| 50 steps for a small feature | Over-planned | Consolidate into ~5-10 meaningful steps |

---

## Example Usage

```markdown
# Example Plan to Review

## Goal
Add a "duplicate query" button to the saved queries list.

## Steps
1. Add `duplicateQuery` method to QueryService
2. Create POST /api/queries/:id/duplicate endpoint
3. Add "Duplicate" button to QueryListItem component
4. Wire button to API call with loading state
5. Show success toast on completion
6. Add test for duplicate endpoint

## Files
- apps/api/src/queries/queries.service.ts
- apps/api/src/queries/queries.controller.ts
- apps/web/src/features/queries/QueryListItem.tsx
```

**Review Notes:**
- ⚠️ Step 1 needs: what does duplicateQuery return? What fields are copied?
- ⚠️ Step 2 needs: what's the response shape? Auth required?
- ⚠️ Step 6 too vague: what specifically is tested?
- ❌ Missing: Zod validation schema for endpoint
- ❌ Missing: RLS check (user can only duplicate own queries)

---

## References

- [Addy Osmani: How to write a good spec for AI agents](https://addyosmani.com/blog/good-spec/)
- [JetBrains: Spec-Driven Approach for Coding with AI](https://blog.jetbrains.com/junie/2025/10/how-to-use-a-spec-driven-approach-for-coding-with-ai/)
- [AppExchange Security Review Checklist](../../../docs/security-review-materials/APPEXCHANGE-SECURITY-REVIEW-CHECKLIST.md)
