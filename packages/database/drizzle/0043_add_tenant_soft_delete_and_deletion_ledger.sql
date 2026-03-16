ALTER TABLE tenants ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE tenants ADD COLUMN deletion_metadata JSONB;

CREATE TABLE deletion_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  entity_identifier VARCHAR(255),
  deleted_by VARCHAR(255) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
