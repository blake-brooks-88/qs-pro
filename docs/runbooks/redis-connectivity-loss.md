# Redis Connectivity Loss

## Alert Trigger

- `/readyz` returns HTTP 503 with redis status unhealthy
- BullMQ health check fails (Worker `/readyz`)
- Application logs show Redis connection errors

## Severity

Critical

## Symptoms

- Session creation fails (new users cannot log in)
- Query execution fails (BullMQ cannot enqueue jobs to `shell-query` queue)
- SSE events stop (Redis pub/sub for real-time updates broken)
- Bull Board dashboard inaccessible or shows stale data
- Application returns HTTP 500 or 503 errors for authenticated requests

## Likely Causes

1. **Redis server down** - Process crashed or was killed
2. **Network partition** - Connectivity between application and Redis lost
3. **Redis memory limit reached** - `maxmemory` exceeded, writes rejected
4. **Redis connection pool exhausted** - Too many clients connected
5. **Docker container issue** - Redis container stopped or unhealthy

## Diagnosis Steps

1. Check Redis connectivity:
   ```
   redis-cli -u $REDIS_URL ping
   # Expected: PONG
   ```

2. Check Redis server status:
   ```
   redis-cli -u $REDIS_URL info server | grep -E "uptime|version"
   ```

3. Check Redis memory usage:
   ```
   redis-cli -u $REDIS_URL info memory | grep -E "used_memory_human|maxmemory_human|maxmemory_policy"
   ```

4. Check connected client count:
   ```
   redis-cli -u $REDIS_URL info clients | grep connected_clients
   ```

5. Check if Docker container is running:
   ```
   docker ps | grep redis
   docker logs qpp-redis --tail 50
   ```

6. Check application health endpoints:
   ```
   curl http://localhost:3000/readyz   # API
   curl http://localhost:3001/readyz   # Worker
   ```

7. Check BullMQ queue status:
   ```
   redis-cli -u $REDIS_URL keys "bull:shell-query:*" | wc -l
   ```

## Resolution Steps

1. **If Redis is down:**
   ```
   docker-compose up -d redis
   # or
   systemctl restart redis
   ```
   Wait 10 seconds, then verify:
   ```
   redis-cli -u $REDIS_URL ping
   ```

2. **If memory limit reached:**
   - Check for expired keys that can be flushed:
   ```
   redis-cli -u $REDIS_URL dbsize
   redis-cli -u $REDIS_URL info keyspace
   ```
   - Clear expired session keys:
   ```
   redis-cli -u $REDIS_URL --scan --pattern "sess:*" | head -20
   ```
   - If urgent, increase maxmemory:
   ```
   redis-cli -u $REDIS_URL config set maxmemory 512mb
   ```

3. **If connection pool exhausted:**
   - Check for connection leaks in application
   - Restart applications to release stale connections:
   ```
   docker-compose restart api worker
   ```

4. **If network partition:**
   - Verify DNS resolution
   - Check firewall rules
   - Test from application container:
   ```
   docker exec qpp-api redis-cli -u $REDIS_URL ping
   ```

5. **After recovery:**
   - Verify health endpoints return healthy:
   ```
   curl http://localhost:3000/readyz
   curl http://localhost:3001/readyz
   ```
   - Check BullMQ queue is processing:
   ```
   curl http://localhost:3001/admin/queues
   ```

## Escalation

- If Redis cannot be restarted: check disk space and system resources
- If persistent memory issues: review session TTL and BullMQ job retention settings
- If network partition: escalate to infrastructure team

## Prevention

- Configure Redis persistence (RDB snapshots or AOF) to survive restarts
- Monitor Redis memory usage with alerting at 80% of maxmemory
- Set appropriate `maxmemory-policy` (e.g., `allkeys-lru` for cache-heavy workloads)
- Configure Redis `timeout` to close idle connections automatically
- Consider Redis Sentinel or Cluster for high availability in production
- Ensure BullMQ job data has TTL to prevent unbounded growth
