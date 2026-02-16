# BullMQ Queue Backlog

## Alert Trigger

- `shell_query_active_jobs` gauge consistently > 10 for 5+ minutes
- Queue depth growing over time (monotonically increasing pending jobs)
- User-reported query execution delays

## Severity

Medium

## Symptoms

- Query execution takes significantly longer than usual
- Pending jobs accumulating in Bull Board dashboard
- Users see "queued" status for extended periods
- `shell_query_jobs_total{status="completed"}` rate drops below normal baseline

## Likely Causes

1. **Worker processing slower than usual** - MCE latency causing each job to take longer
2. **Worker process crashed or stuck** - No consumer draining the queue
3. **Redis connection issues** - BullMQ cannot communicate with Redis
4. **Sudden traffic spike** - More jobs enqueued than worker capacity

## Diagnosis Steps

1. Check Bull Board dashboard for queue state:
   ```
   curl http://localhost:3001/admin/queues
   ```
   (Requires admin authentication)

2. Check if worker process is running:
   ```
   docker ps | grep worker
   # or
   ps aux | grep worker
   ```

3. Check worker logs for errors:
   ```
   docker logs qpp-worker --tail 100
   ```

4. Check Redis connectivity from worker:
   ```
   redis-cli -u $REDIS_URL ping
   ```

5. Check queue metrics:
   ```
   # Active jobs gauge
   curl -s http://localhost:3001/metrics | grep shell_query_active_jobs

   # Job completion rate
   curl -s http://localhost:3001/metrics | grep shell_query_jobs_total
   ```

6. Check for stuck/stalled jobs in Bull Board:
   - Look for jobs in "active" state for > 10 minutes
   - Check "failed" tab for repeated failures

## Resolution Steps

1. **If worker crashed:**
   ```
   docker-compose restart worker
   # or
   pm2 restart worker
   ```

2. **If MCE is slow (causing backlog):**
   - Accept that backlog will drain when MCE recovers
   - Monitor `qpp_mce_api_calls_total{status="timeout"}` for correlation
   - See `mce-timeout-spikes.md` runbook

3. **If stuck jobs (active > 10 minutes):**
   - Use Bull Board to manually remove or retry stuck jobs
   - Check if job IDs correlate with MCE timeout errors

4. **If Redis connection issues:**
   - See `redis-connectivity-loss.md` runbook

5. **If traffic spike:**
   - Monitor queue depth trend; if stabilizing, no action needed
   - Consider scaling worker instances if sustained

## Escalation

- If worker restart does not resolve: check for application bugs in recent deployments
- If queue depth exceeds 100 pending jobs for > 15 minutes: scale worker horizontally

## Prevention

- Configure job timeout limits to prevent indefinite active jobs
- Monitor `shell_query_active_jobs` with alerting threshold
- Consider auto-scaling worker processes based on queue depth
- Ensure worker health checks (`/readyz`) include BullMQ connectivity
