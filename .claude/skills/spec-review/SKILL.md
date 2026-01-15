---
name: Spec Review
description: Review specifications to ensure they're ready for AI-driven development. Use this skill when validating that a spec is complete, unambiguous, and implementable before handing off to an AI coding agent. Invoke with a spec folder path. Use when reading or working with files in agent-os/specs/ directories, when encountering spec.md or tasks.md files, when preparing to implement a feature from a specification, when the user asks to "review a spec" or "validate requirements", when checking if a spec is ready for implementation, when analyzing specification quality or completeness, when verifying security requirements are addressed in specifications, or when ensuring specs follow the agent-os specification format with proper Goal, User Stories, Requirements, and Out of Scope sections.
---

## When to use this skill

- When reading or working with files in `agent-os/specs/` directories
- When encountering `spec.md`, `tasks.md`, or `requirements.md` files
- Before starting implementation of any feature specification
- When the user asks to "review a spec", "validate requirements", or "check if spec is ready"
- When preparing to hand off a specification to an AI coding agent
- After creating a new spec using the spec-writer or spec-shaper agents
- When validating that requirements are complete and unambiguous
- When checking that a spec follows project conventions and agent-os format
- When ensuring a spec is "AI-ready" (optimized for LLM agents)
- When reviewing specs created by others or by automated processes
- When verifying security requirements reference the AppExchange Security Review Checklist
- When checking task breakdown quality, dependencies, and execution order
- When analyzing whether acceptance criteria are testable and specific
- When looking for anti-patterns like vague instructions or missing file paths

# Spec Review Prompt

Use this prompt to review a specification. Replace `{SPEC_PATH}` with the actual spec folder path.

---

## Review Instructions

You are performing a comprehensive spec review for: `{SPEC_PATH}`

### Step 1: Gather Spec Contents

Read all files in the spec folder:
1. `spec.md` - Main specification document
2. `tasks.md` - Task breakdown with execution order
3. `planning/user-request.md` - Original user request
4. `planning/requirements.md` - Refined requirements after Q&A

### Step 2: Structural Completeness Checklist

Verify the spec folder contains all required artifacts:

**Core Files**
- [ ] `spec.md` exists and is non-empty
- [ ] `tasks.md` exists and is non-empty
- [ ] `planning/` directory exists
- [ ] `planning/user-request.md` exists (raw user input)
- [ ] `planning/requirements.md` exists (refined requirements)

**spec.md Structure**
- [ ] Has "Goal" section (1-2 sentence high-level objective)
- [ ] Has "User Stories" section (2-4 stories with "As a... I want... so that...")
- [ ] Has "Specific Requirements" section with detailed functional requirements
- [ ] Has "Existing Code to Leverage" section (file paths, not vague references)
- [ ] Has "Out of Scope" section with explicit boundaries

**tasks.md Structure**
- [ ] Has "Overview" with total task groups count
- [ ] Task groups use hierarchical numbering (1.0, 1.1, 1.2...)
- [ ] Each task group has explicit "Dependencies" listed
- [ ] Each task group has "Acceptance Criteria" (testable statements)
- [ ] Has "Execution Order" section explaining build sequence

### Step 3: AI-Readiness Quality Gates

Based on [2025 best practices](https://addyosmani.com/blog/good-spec/), verify the spec is optimized for AI agents:

**Specificity (No Vague Instructions)**
- [ ] Requirements use specific technical terms, not "make it work" language
- [ ] File paths are absolute (e.g., `/home/.../apps/api/src/...`), not relative
- [ ] Configuration values are explicit numbers, not "reasonable defaults"
- [ ] Examples include actual code snippets where patterns matter

**Boundaries (Three-Tier System)**
- [ ] "Out of Scope" section explicitly lists what NOT to build
- [ ] No hidden assumptions about behavior (everything is stated)
- [ ] Dependencies on external systems are documented
- [ ] Security/auth boundaries are explicitly defined

**Testability**
- [ ] Each requirement can be verified by a test or observation
- [ ] Acceptance criteria are binary (pass/fail), not subjective
- [ ] Expected inputs/outputs are documented where applicable
- [ ] Error cases and edge cases are addressed

**Context Completeness**
- [ ] Existing code references include what to reuse and how
- [ ] Technical constraints (versions, dependencies) are documented
- [ ] Integration points with other systems are mapped
- [ ] Any "gotchas" or known pitfalls are warned about

### Step 4: Task Breakdown Quality

Validate `tasks.md` follows the [spec-driven approach](https://blog.jetbrains.com/junie/2025/10/how-to-use-a-spec-driven-approach-for-coding-with-ai/):

**Dependency Graph**
- [ ] Dependencies form a valid DAG (no circular dependencies)
- [ ] Independent tasks can be parallelized
- [ ] Critical path is identifiable

**Task Granularity**
- [ ] Each task group is completable in a single agent session
- [ ] Subtasks (1.1, 1.2, etc.) are atomic actions
- [ ] No task requires implicit knowledge not in the spec

**Test-First Pattern**
- [ ] Each task group starts with "Write X-Y focused tests" subtask
- [ ] Test counts are reasonable (3-8 per group, not 50)
- [ ] Tests are written BEFORE implementation subtasks

**Verification Points**
- [ ] Each task group ends with "Ensure tests pass" subtask
- [ ] Acceptance criteria map 1:1 to testable outcomes

### Step 5: Common Anti-Patterns Check

Flag these issues if present:

| Anti-Pattern | Why It's Bad | Found? |
|--------------|--------------|--------|
| "Handle edge cases" without listing them | Agent will guess or skip | [ ] |
| "Follow best practices" without specifics | Best practices vary, agent needs explicit guidance | [ ] |
| Referencing files without full paths | Agent may not find correct file | [ ] |
| "Similar to X" without explaining difference | Agent will copy verbatim | [ ] |
| Missing error handling requirements | Agent will skip error paths | [ ] |
| "Performance should be good" | No measurable target | [ ] |
| Unlisted dependencies between tasks | Agent may execute out of order | [ ] |
| Over 50 subtasks in one spec | Context overload, spec should be split | [ ] |

### Step 6: Security & Compliance Review

**Reference:** [AppExchange Security Review Checklist](../../../docs/security-review-materials/APPEXCHANGE-SECURITY-REVIEW-CHECKLIST.md)

For specs involving security-sensitive features, verify the spec addresses relevant checklist sections:

**Authentication & Session (Checklist §6, §7)**
- [ ] OAuth 2.0 implementation requirements explicit (§6)
- [ ] Session security requirements (Secure, HttpOnly, SameSite) addressed (§6)
- [ ] MCE Enhanced Package requirements considered for iframe embedding (§7)
- [ ] Token storage and refresh requirements specified (§7)

**Access Control (Checklist §5)**
- [ ] Row-Level Security (RLS) requirements for multi-tenant isolation
- [ ] Authorization checks on every request (not just UI hiding)
- [ ] IDOR prevention (verify user owns requested resources)
- [ ] Principle of least privilege documented

**Data Protection (Checklist §8)**
- [ ] Zero-data proxy pattern maintained (no persistent MCE data storage)
- [ ] Encryption requirements (at-rest: AES-256, in-transit: TLS 1.2+)
- [ ] Data retention policies specified
- [ ] No customer data in logs (or properly masked)

**API Security (Checklist §9)**
- [ ] Input validation requirements (Zod schemas)
- [ ] Rate limiting requirements specified
- [ ] CSRF protection for state-changing operations
- [ ] Error handling returns generic messages (no stack traces)
- [ ] SSRF prevention for any outbound requests (host allowlisting)

**Frontend Security (Checklist §10)**
- [ ] CSP requirements (frame-ancestors for MCE embedding)
- [ ] Cookie security (Secure, HttpOnly, SameSite=None for iframe)
- [ ] No sensitive data in localStorage
- [ ] No eval() or innerHTML with user data

**Infrastructure (Checklist §11)**
- [ ] Database security (SSL/TLS, credentials not in source)
- [ ] Redis security (TLS, authentication)
- [ ] Network isolation requirements

**Operational Security (Checklist §12)**
- [ ] Audit logging requirements addressed
- [ ] Structured logging with correlation IDs
- [ ] Secrets/tokens/PII redacted from logs

**Injection Prevention (Checklist §5, §15)**
- [ ] Parameterized queries for all database operations
- [ ] No dynamic SQL construction with user input
- [ ] XSS prevention (output encoding, React patterns)
- [ ] SOAP/XML injection prevention for MCE calls

**Checklist Section Mapping**
If the spec touches these areas, verify corresponding checklist sections are addressed:

| Spec Area | Checklist Sections |
|-----------|-------------------|
| Authentication/OAuth | §6, §7 |
| API endpoints | §5, §9, §15 |
| Database operations | §5, §11 |
| MCE API calls | §7, §9 (SSRF) |
| Frontend UI | §10 |
| Data handling | §8 |
| Logging/monitoring | §12 |
| Multi-tenant features | §5 (RLS), §16 (Zero-Trust) |

### Step 7: Provide Structured Feedback

Structure your review as:

```markdown
## Spec Review: [Spec Name]

### Summary
Brief overview of what the spec accomplishes and overall readiness assessment.

### Readiness Score: X/10
- 9-10: Ready for immediate implementation
- 7-8: Minor clarifications needed
- 5-6: Significant gaps require revision
- <5: Spec needs major rework

### Structural Completeness
| Item | Status |
|------|--------|
| spec.md sections complete | [checkmark]/[x] |
| tasks.md structure valid | [checkmark]/[x] |
| planning/ artifacts present | [checkmark]/[x] |

### AI-Readiness Assessment
| Criterion | Status | Notes |
|-----------|--------|-------|
| Specificity | [checkmark]/[x] | ... |
| Boundaries | [checkmark]/[x] | ... |
| Testability | [checkmark]/[x] | ... |
| Context | [checkmark]/[x] | ... |

### Security Assessment
*Reference: AppExchange Security Review Checklist*

| Area | Applicable? | Addressed? | Checklist Sections |
|------|-------------|------------|-------------------|
| Authentication/OAuth | Y/N | [checkmark]/[x]/N/A | §6, §7 |
| Access Control/RLS | Y/N | [checkmark]/[x]/N/A | §5 |
| Data Protection | Y/N | [checkmark]/[x]/N/A | §8 |
| API Security | Y/N | [checkmark]/[x]/N/A | §9 |
| Frontend Security | Y/N | [checkmark]/[x]/N/A | §10 |
| Injection Prevention | Y/N | [checkmark]/[x]/N/A | §5, §15 |
| Logging/Audit | Y/N | [checkmark]/[x]/N/A | §12 |

**Security Notes:**
- [Any security concerns or requirements that need clarification]

### Issues Found

#### Critical (Must Fix Before Implementation)
- Issue description with specific location in spec
- Suggested fix

#### Warnings (Should Address)
- Issue description
- Impact if not addressed

#### Suggestions (Nice to Have)
- Improvement idea
- Benefit

### Questions for Clarification
Questions that need answers before implementation can proceed.

### Verdict
- [ ] Approved for Implementation
- [ ] Needs Revision (see Critical issues)
- [ ] Needs Major Rework
```

---

## Scoring Rubric

**10/10 - Exemplary**
- All structural elements present
- Zero vague requirements
- Complete test coverage plan
- Clear execution order with no ambiguity

**8-9/10 - Ready**
- All structural elements present
- 1-2 minor clarifications needed
- Test plan adequate
- Execution order clear

**6-7/10 - Needs Work**
- Missing 1-2 structural elements
- Several vague requirements
- Test plan incomplete
- Some execution order confusion

**4-5/10 - Major Gaps**
- Missing multiple structural elements
- Many vague requirements
- No test plan
- Unclear execution order

**<4/10 - Not Ready**
- Fundamental structure missing
- More brainstorming than spec
- No actionable tasks

---

## Example Usage

```bash
# Review the shell query engine spec
# Read: agent-os/specs/2026-01-07-shell-query-engine-backend/spec.md
# Read: agent-os/specs/2026-01-07-shell-query-engine-backend/tasks.md
# Read: agent-os/specs/2026-01-07-shell-query-engine-backend/planning/requirements.md
# Then apply this review checklist
```

---

## References

- [Addy Osmani: How to write a good spec for AI agents](https://addyosmani.com/blog/good-spec/)
- [JetBrains: Spec-Driven Approach for Coding with AI](https://blog.jetbrains.com/junie/2025/10/how-to-use-a-spec-driven-approach-for-coding-with-ai/)
- [Addy Osmani: LLM Coding Workflow 2026](https://addyosmani.com/blog/ai-coding-workflow/)
- [Medium: Coding Standards for AI Agents](https://medium.com/@christianforce/coding-standards-for-ai-agents-cb5c80696f72)
