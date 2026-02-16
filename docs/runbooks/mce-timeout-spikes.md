# MCE Timeout Spikes

## Alert Trigger

- `qpp_mce_api_calls_total{status="timeout"}` rate exceeds threshold
- Sentry transaction duration > 30s for MCE operations
- Multiple `withRetry` exhaustion errors in Sentry

## Severity

High

## Symptoms

- Users report slow query execution or metadata loading
- SOAP/REST calls to MCE timing out
- `withRetry` exhausting all 3 retry attempts in error logs
- Elevated `qpp_query_duration_seconds` histogram values

## Likely Causes

1. **MCE platform degradation** - Salesforce-side outage or maintenance
2. **MCE rate limiting** - Too many concurrent API calls from this BU
3. **Network issues** - Connectivity problems between QS Pro and MCE endpoints
4. **MCE maintenance window** - Scheduled or unscheduled Salesforce downtime

## Diagnosis Steps

1. Check Salesforce Trust Site for active incidents:
   ```
   https://trust.salesforce.com
   ```

2. Check Sentry for MCE operation spans:
   - Filter by transaction name containing "mce" or "soap"
   - Look for consistent timeout patterns vs intermittent failures

3. Check current timeout configuration (from Phase 1.7):
   - Metadata/queue/poll operations: 30s timeout
   - Data retrieval operations: 120s timeout
   - Verify in `MCE_TIMEOUTS` constants

4. Check retry behavior in logs:
   ```
   grep "withRetry" /var/log/qpp-api/*.log | tail -50
   ```

5. Check if specific operations are affected or all MCE calls:
   ```
   # Prometheus query for timeout rate by operation
   rate(qpp_mce_api_calls_total{status="timeout"}[5m])
   ```

## Resolution Steps

1. **If MCE platform is down:**
   - Confirm on Salesforce Trust Site
   - Communicate status to users via in-app notification
   - No action needed; `withRetry` handles transient failures automatically

2. **If MCE rate limiting detected:**
   - Check BU-level API call volume
   - Consider spacing out metadata refresh intervals
   - Review concurrent user count for the affected BU

3. **If network issues:**
   - Check DNS resolution for MCE endpoints
   - Verify outbound firewall rules
   - Test connectivity: `curl -v https://YOUR_INSTANCE.rest.marketingcloudapis.com/`

4. **For transient spikes (< 5 minutes):**
   - No action needed; `withRetry` with exponential backoff handles these automatically
   - Monitor that spike resolves

## Escalation

- If MCE is down for > 30 minutes with no Trust Site update: open Salesforce support case
- If timeout rate persists after MCE confirms resolution: escalate to infrastructure team

## Prevention

- Monitor Salesforce Trust Site RSS feed for early warning
- Set up alerting on `qpp_mce_api_calls_total{status="timeout"}` rate
- Consider implementing circuit breaker pattern for MCE calls if chronic instability
