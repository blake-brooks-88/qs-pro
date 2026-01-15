# Console Debug Report: SQL Lint Rules

**Date:** 2026-01-14
**Tested URL:** http://localhost:5176

---

## Summary of Findings

### Critical Bug Identified: Stale Closure Race Condition

The debug logs reveal a **race condition bug** in the `use-sql-diagnostics` hook. The worker response callback uses **captured (stale) values** instead of current state, causing blocking diagnostics to be incorrectly cleared.

**Root Cause:** When the web worker responds, the `WORKER_MERGE_ATTEMPT` log shows:
```
hasPrereqCaptured: false, note: These are CAPTURED values from when worker was created!
```

This means the worker's response callback is using the `hasPrereq` value from when the worker request was initiated, not the current value after sync linting completes.

---

## Query 1: Empty Editor

**SQL:** `(empty)`
**Expected:** Blocked (prereq error)
**Actual:** BLOCKED (RUN button disabled)

### Console Logs
```
[SQL-DIAG] SYNC_LINT {sqlPreview: , count: 1, diagnostics: Array(1)}
[SQL-DIAG] SYNC_EFFECT_MERGE {syncCount: 1, workerRefCount: 0, hasPrereq: true, syncDiagnostics: Array(1), workerDiagnostics: Array(0)}
[SQL-DIAG] SYNC_EFFECT_RESULT {mergedCount: 1, merged: Array(1)}
[SQL-DIAG] HOOK_RETURN {mergedCount: 1, hasBlocking: true, diagnostics: Array(1)}
[EXEC-GATE] {sqlPreview: , diagnosticsCount: 1, hasBlocking: true, blockingDiag: Object, allDiagnostics: Array(1)}
```

### Analysis
**WORKING CORRECTLY** - The empty editor case works because:
1. The sync lint correctly detects `hasPrereq: true` (missing SELECT)
2. The effect merge preserves the prereq diagnostic
3. The worker hadn't been triggered yet for a previous query to race against

---

## Query 2: Missing SELECT

**SQL:** `FROM [Subscribers]`
**Expected:** Blocked (prereq error - missing SELECT)
**Actual:** NOT BLOCKED (RUN button enabled)

### Console Logs (Key Sequence)
```
// Initial sync lint correctly detects prereq issue
[SQL-DIAG] SYNC_LINT {sqlPreview: FROM [Subscribers], count: 1, diagnostics: Array(1)}
[SQL-DIAG] HOOK_RETURN {mergedCount: 1, hasBlocking: true, diagnostics: Array(1)}
[EXEC-GATE] {sqlPreview: FROM [Subscribers], diagnosticsCount: 1, hasBlocking: true, blockingDiag: Object}

// Effect merge also correctly preserves it
[SQL-DIAG] SYNC_EFFECT_MERGE {syncCount: 1, workerRefCount: 0, hasPrereq: true, syncDiagnostics: Array(1), workerDiagnostics: Array(0)}
[SQL-DIAG] SYNC_EFFECT_RESULT {mergedCount: 1, merged: Array(1)}
[SQL-DIAG] HOOK_RETURN {mergedCount: 1, hasBlocking: true, diagnostics: Array(1)}
[EXEC-GATE] {sqlPreview: FROM [Subscribers], diagnosticsCount: 1, hasBlocking: true, blockingDiag: Object}

// BUT THEN worker response comes with STALE captured values!
[SQL-DIAG] WORKER_RESPONSE {requestId: lint-1768416289038-rg34n4x, latestRequestId: lint-1768416289038-rg34n4x, isLatest: true, workerDiagCount: 0}
[SQL-DIAG] WORKER_MERGE_ATTEMPT {syncDiagnosticsCount: 1, syncDiagnosticsCaptured: Array(1), hasPrereqCaptured: false, note: These are CAPTURED values from when worker was created!}
[SQL-DIAG] WORKER_MERGE_RESULT {prevCount: 1, mergedCount: 1, merged: Array(1)}

// Final state incorrectly shows hasBlocking: false
[SQL-DIAG] HOOK_RETURN {mergedCount: 1, hasBlocking: false, diagnostics: Array(1)}
[EXEC-GATE] {sqlPreview: FROM [Subscribers], diagnosticsCount: 1, hasBlocking: false, blockingDiag: null}
```

### Analysis
**BUG:** The worker response callback uses stale `hasPrereqCaptured: false` from when the worker was created (during a previous valid query). This overwrites the correct current state where `hasPrereq: true`.

The bug occurs in the worker response handler which re-calculates blocking status using captured closure values instead of current React state.

---

## Query 3: Aggregate without GROUP BY

**SQL:** `SELECT Category, COUNT(*) FROM [Products]`
**Expected:** Blocked (error from aggregateGroupingRule)
**Actual:** NOT BLOCKED (RUN button enabled)

### Console Logs (Key Sequence)
```
// Initial sync lint detects blocking issue
[SQL-DIAG] SYNC_LINT {sqlPreview: SELECT Category, COUNT(*) FROM [Products], count: 1, diagnostics: Array(1)}
[SQL-DIAG] SYNC_EFFECT_MERGE {syncCount: 1, workerRefCount: 0, hasPrereq: false, syncDiagnostics: Array(1)}
[SQL-DIAG] SYNC_EFFECT_RESULT {mergedCount: 1, merged: Array(1)}
[SQL-DIAG] HOOK_RETURN {mergedCount: 1, hasBlocking: true, diagnostics: Array(1)}
[EXEC-GATE] {sqlPreview: SELECT Category, COUNT(*) FROM [Products], diagnosticsCount: 1, hasBlocking: true, blockingDiag: Object}

// Worker response clears the blocking status!
[SQL-DIAG] WORKER_RESPONSE {requestId: lint-1768416309416-1u0hsfk, workerDiagCount: 0}
[SQL-DIAG] WORKER_MERGE_ATTEMPT {syncDiagnosticsCount: 1, syncDiagnosticsCaptured: Array(1), hasPrereqCaptured: false}
[SQL-DIAG] WORKER_MERGE_RESULT {prevCount: 1, mergedCount: 1, merged: Array(1)}
[SQL-DIAG] HOOK_RETURN {mergedCount: 1, hasBlocking: false, diagnostics: Array(1)}
[EXEC-GATE] {sqlPreview: SELECT Category, COUNT(*) FROM [Products], diagnosticsCount: 1, hasBlocking: false, blockingDiag: null}
```

### Analysis
**BUG:** Same race condition. The aggregate grouping rule is a sync rule that produces an error-level diagnostic. But the worker merge handler recalculates `hasBlocking` from the merged diagnostics without properly considering the sync diagnostics' severity.

The issue is that after worker merge, the code recalculates `hasBlocking` but the sync diagnostic is being merged without its blocking status being preserved.

---

## Query 4: Variable Usage

**SQL:** `SELECT @myVar FROM [Subscribers]`
**Expected:** Blocked (error from variableUsageRule)
**Actual:** NOT BLOCKED (RUN button enabled)

### Console Logs (Key Sequence)
```
// Initial sync lint correctly detects error
[SQL-DIAG] SYNC_LINT {sqlPreview: SELECT @myVar FROM [Subscribers], count: 1, diagnostics: Array(1)}
[SQL-DIAG] SYNC_EFFECT_MERGE {syncCount: 1, workerRefCount: 0, hasPrereq: false, syncDiagnostics: Array(1)}
[SQL-DIAG] SYNC_EFFECT_RESULT {mergedCount: 1, merged: Array(1)}
[SQL-DIAG] HOOK_RETURN {mergedCount: 1, hasBlocking: true, diagnostics: Array(1)}
[EXEC-GATE] {sqlPreview: SELECT @myVar FROM [Subscribers], diagnosticsCount: 1, hasBlocking: true, blockingDiag: Object}

// Worker response clears the blocking status!
[SQL-DIAG] WORKER_RESPONSE {requestId: lint-1768416325728-tqfe6op, workerDiagCount: 0}
[SQL-DIAG] WORKER_MERGE_ATTEMPT {syncDiagnosticsCount: 1, hasPrereqCaptured: false}
[SQL-DIAG] WORKER_MERGE_RESULT {prevCount: 1, mergedCount: 1, merged: Array(1)}
[SQL-DIAG] HOOK_RETURN {mergedCount: 1, hasBlocking: false, diagnostics: Array(1)}
[EXEC-GATE] {sqlPreview: SELECT @myVar FROM [Subscribers], diagnosticsCount: 1, hasBlocking: false, blockingDiag: null}
```

### Analysis
**BUG:** Same race condition pattern. The `@variable` detection is a sync rule with error severity. The worker merge callback clears the blocking status because it uses stale captured values.

---

## Query 5: Valid Query

**SQL:** `SELECT * FROM [Subscribers] WHERE Status = 'Active'`
**Expected:** NOT Blocked
**Actual:** NOT BLOCKED (RUN button enabled)

### Console Logs (Key Sequence)
```
[SQL-DIAG] SYNC_LINT {sqlPreview: SELECT * FROM [Subscribers] WHERE Status = 'Active, count: 1, diagnostics: Array(1)}
[SQL-DIAG] SYNC_EFFECT_MERGE {syncCount: 1, workerRefCount: 0, hasPrereq: false, syncDiagnostics: Array(1)}
[SQL-DIAG] SYNC_EFFECT_RESULT {mergedCount: 1, merged: Array(1)}
[SQL-DIAG] HOOK_RETURN {mergedCount: 1, hasBlocking: false, diagnostics: Array(1)}
[EXEC-GATE] {sqlPreview: SELECT * FROM [Subscribers] WHERE Status = 'Active, diagnosticsCount: 1, hasBlocking: false, blockingDiag: null}

[SQL-DIAG] WORKER_RESPONSE {requestId: lint-1768416339958-bvhpwfl, workerDiagCount: 0}
[SQL-DIAG] WORKER_MERGE_ATTEMPT {syncDiagnosticsCount: 1, hasPrereqCaptured: false}
[SQL-DIAG] WORKER_MERGE_RESULT {prevCount: 1, mergedCount: 1, merged: Array(1)}
```

### Analysis
**WORKING CORRECTLY** - The valid query works because:
1. There are no error/prereq diagnostics in the sync lint
2. The worker also returns 0 diagnostics
3. Even with the stale closure bug, the result happens to be correct

---

## Root Cause Analysis

### The Bug Pattern

```typescript
// PROBLEM: Worker response handler captures these values when created
const syncDiagnosticsRef = useRef(syncDiagnostics);
const hasPrereqRef = useRef(hasPrereq);

// When worker responds, it uses STALE captured values:
worker.onmessage = (e) => {
  // Uses syncDiagnosticsRef.current and hasPrereqRef.current
  // which are from when the worker request was created,
  // NOT the current state after sync lint ran
}
```

### Why This Creates the Bug

1. **T=0:** User types invalid SQL (e.g., `FROM [Subscribers]`)
2. **T=1:** Sync lint runs, detects prereq error, sets `hasPrereq: true`
3. **T=2:** Effect merge correctly shows `hasBlocking: true` - RUN button disabled
4. **T=3:** Worker request is sent, callback captures current state (`hasPrereqCaptured` might still be `false` from previous run)
5. **T=4:** Worker responds with its diagnostics (0 errors from AST analysis)
6. **T=5:** Worker merge handler runs with STALE `hasPrereqCaptured: false`
7. **T=6:** `hasBlocking` is recalculated as `false` - RUN button incorrectly enabled!

---

## Recommended Fix

The worker response handler should use **current React state**, not captured closure values. Options:

### Option A: Use refs that are updated synchronously
```typescript
// Update refs synchronously when sync diagnostics change
useEffect(() => {
  syncDiagnosticsRef.current = syncDiagnostics;
  hasPrereqRef.current = hasPrereq;
}, [syncDiagnostics, hasPrereq]);
```

### Option B: Re-run blocking calculation after worker merge
```typescript
// After merging worker results, recalculate hasBlocking from merged diagnostics
const hasBlocking = merged.some(d =>
  d.severity === DiagnosticSeverity.Error ||
  (d as any).isPrereq
);
```

### Option C: Always preserve sync diagnostic blocking status
```typescript
// In worker merge, preserve blocking status from sync diagnostics
if (syncDiagnostics.some(d => d.severity === DiagnosticSeverity.Error)) {
  // Don't let worker results clear blocking status
}
```

---

## Test Results Summary

| Query | Expected | Actual | Status |
|-------|----------|--------|--------|
| 1. Empty editor | Blocked | Blocked | PASS |
| 2. `FROM [Subscribers]` | Blocked | Not blocked | FAIL |
| 3. `SELECT Category, COUNT(*) FROM [Products]` | Blocked | Not blocked | FAIL |
| 4. `SELECT @myVar FROM [Subscribers]` | Blocked | Not blocked | FAIL |
| 5. `SELECT * FROM [Subscribers] WHERE Status = 'Active'` | Not blocked | Not blocked | PASS |

**Pass Rate:** 2/5 (40%)

**Root Cause:** Stale closure values in worker response callback causing incorrect `hasBlocking` calculation after async worker merge.
