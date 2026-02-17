# PostgreSQL Connection Pool Exhaustion

## Alert Trigger

- `/readyz` returns HTTP 503 with postgres status unhealthy
- `pg_pool_active_connections` approaching configured max pool size
- Application logs show connection timeout errors

## Severity

Critical

## Symptoms

- API returns HTTP 503 errors
- Slow response times across all endpoints
- Connection timeout errors in application logs:
  ```
  Error: Timed out waiting for pool connection
  ```
- `/readyz` endpoint reports postgres as unhealthy

## Likely Causes

1. **Connection leak** - Connections not being released back to pool (e.g., unfinished transactions)
2. **Long-running queries** - Queries holding connections open for extended periods
3. **Traffic spike** - More concurrent requests than pool can handle
4. **Idle-in-transaction connections** - Transactions started but not committed/rolled back

## Diagnosis Steps

1. Check current connection count:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE datname = 'qs_pro';
   ```

2. Check for idle-in-transaction connections:
   ```sql
   SELECT pid, state, query, now() - state_change AS duration
   FROM pg_stat_activity
   WHERE datname = 'qs_pro'
     AND state = 'idle in transaction'
   ORDER BY duration DESC;
   ```

3. Check for long-running active queries:
   ```sql
   SELECT pid, state, query, now() - query_start AS duration
   FROM pg_stat_activity
   WHERE datname = 'qs_pro'
     AND state = 'active'
   ORDER BY duration DESC;
   ```

4. Check application health endpoint:
   ```
   curl http://localhost:3000/readyz
   ```

5. Check RLS context operations in logs:
   ```
   grep "SET LOCAL" /var/log/qpp-api/*.log | tail -20
   ```
   Note: Phase 1.7 changed RLS from session-scoped `set_config(..., false)` to
   transaction-scoped `SET LOCAL` within `BEGIN/COMMIT`. Connection leaks from
   stale RLS context should no longer occur.

6. Check for intentional fail-closed restarts (RLS cleanup / rollback failure):
   - In production, if the API cannot reliably clear request-scoped RLS session
     state (or cannot reliably roll back a transaction), it will fail closed by
     draining/destroying the SQL client pool and exiting with code `1` so the
     supervisor restarts the service.
   - Look for log lines preceding the exit, e.g.:
     ```
     Failed to clear RLS context before releasing connection
     Failed to DISCARD ALL after RLS clear failure
     Failed to reset RLS context before releasing connection
     Failed to DISCARD ALL after RLS reset failure
     Failed to rollback transaction in ...
     ```
   - Treat repeated occurrences as a DB/session reliability incident (network
     instability, DB overload, backend termination), not as an application bug
     to “ignore”.

7. Check pool configuration:
   ```
   grep "pool" .env
   # Default: DATABASE_POOL_SIZE or postgres.js default (10)
   ```

## Resolution Steps

1. **Immediate: Kill idle-in-transaction connections:**
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE datname = 'qs_pro'
     AND state = 'idle in transaction'
     AND now() - state_change > interval '5 minutes';
   ```

2. **If connection leak suspected:**
   - Restart the API application to release all connections
   ```
   docker-compose restart api
   ```

3. **If long-running queries:**
   - Identify and optimize the slow query
   - Consider adding a statement timeout:
   ```sql
   ALTER DATABASE qs_pro SET statement_timeout = '30s';
   ```

4. **If traffic spike:**
   - Scale API instances horizontally
   - Consider increasing pool size (requires restart):
   ```
   DATABASE_POOL_SIZE=20
   ```

## Escalation

- If connections cannot be freed: restart PostgreSQL as last resort
- If connection leaks recur: investigate recent code changes to RLS context handling

## Prevention

- Monitor active connection count with alerting threshold at 80% of pool max
- Configure `idle_in_transaction_session_timeout` in PostgreSQL:
  ```sql
  ALTER DATABASE qs_pro SET idle_in_transaction_session_timeout = '60s';
  ```
- Set `statement_timeout` to prevent unbounded query execution
- Review connection pool size relative to expected concurrent users
