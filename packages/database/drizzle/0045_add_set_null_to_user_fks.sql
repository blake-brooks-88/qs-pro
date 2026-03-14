-- Add ON DELETE SET NULL to all user-referencing FKs
-- Also make NOT NULL user_id columns nullable where needed

-- shell_query_runs.user_id: DROP NOT NULL, then SET NULL FK
ALTER TABLE shell_query_runs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE shell_query_runs
  DROP CONSTRAINT IF EXISTS shell_query_runs_user_id_users_id_fk,
  ADD CONSTRAINT shell_query_runs_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- folders.user_id: DROP NOT NULL, then SET NULL FK
ALTER TABLE folders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE folders
  DROP CONSTRAINT IF EXISTS folders_user_id_users_id_fk,
  ADD CONSTRAINT folders_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- saved_queries.user_id: DROP NOT NULL, then SET NULL FK
ALTER TABLE saved_queries ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE saved_queries
  DROP CONSTRAINT IF EXISTS saved_queries_user_id_users_id_fk,
  ADD CONSTRAINT saved_queries_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- saved_queries.updated_by_user_id: already nullable, just SET NULL FK
ALTER TABLE saved_queries
  DROP CONSTRAINT IF EXISTS saved_queries_updated_by_user_id_users_id_fk,
  ADD CONSTRAINT saved_queries_updated_by_user_id_users_id_fk
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- query_versions.user_id: DROP NOT NULL, then SET NULL FK
ALTER TABLE query_versions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE query_versions
  DROP CONSTRAINT IF EXISTS query_versions_user_id_fkey,
  ADD CONSTRAINT query_versions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- query_publish_events.user_id: DROP NOT NULL, then SET NULL FK
ALTER TABLE query_publish_events ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE query_publish_events
  DROP CONSTRAINT IF EXISTS query_publish_events_user_id_fkey,
  ADD CONSTRAINT query_publish_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- snippets.user_id: already nullable, just SET NULL FK
ALTER TABLE snippets
  DROP CONSTRAINT IF EXISTS snippets_user_id_users_id_fk,
  ADD CONSTRAINT snippets_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- credentials.user_id: make nullable (was NOT NULL in DB), then SET NULL FK
ALTER TABLE credentials ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE credentials
  DROP CONSTRAINT IF EXISTS credentials_user_id_users_id_fk,
  ADD CONSTRAINT credentials_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
