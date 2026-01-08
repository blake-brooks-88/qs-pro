Context:
  We are building a "Zero-Data Proxy" SQL IDE for Salesforce Marketing Cloud
  Engagement (MCE). We need to implement the backend orchestration layer that
  allows users to execute ad-hoc SQL queries. Since MCE doesn't support direct
  SQL console execution, we use a "Shell" pattern (Temp DE + Query Activity).

  Architectural Requirements:
   1. NestJS Worker: Refactor apps/worker into a NestJS application to share
      MceModule (SOAP/REST bridge), DatabaseModule (Drizzle/RLS), and
      AuthModule (Token encryption) with the API.
   2. BullMQ Orchestration: Use BullMQ + Redis for job durability. The API will
      act as the Producer, and the Worker will act as the Consumer. Jobs must
      carry full tenant context (tenantId, userId, mid) to maintain RLS
      isolation.
   3. Flow Strategy Pattern: Implement an IFlowStrategy interface to handle
      different execution paths. 
       - `RunToTempFlow`: Create Temp DE (24h retention) -> Create Query
         Activity -> Start -> Poll for Status -> Stream Results -> Cleanup.
       - `RunToTargetFlow`: Execute SQL into an existing user-defined Data
         Extension.
   4. Zero-Data Proxy Streaming: Do NOT persist query results in our database.
      The Worker should fetch pages from MCE and push them to a Redis Pub/Sub
      channel. The API should subscribe to this channel and stream results to
      the UI via Server-Sent Events (SSE).
   5. Asset Recycling: The worker must handle the "Recycling" of temporary MCE
      assets (deleting the Temp DE and Query Activity) after execution or if
      the job fails.

  Technical Stack:
   - Backend: NestJS (Fastify), BullMQ, Redis.
   - Database: PostgreSQL (Drizzle ORM) with Row Level Security (RLS).
   - MCE Bridge: Existing SOAP/REST utility in apps/api/src/mce.
