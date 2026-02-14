import { SetMetadata } from '@nestjs/common';

export const AUDIT_EVENT_KEY = 'audit_event_type';

export interface AuditedOptions {
  eventType: string;
  targetIdParam?: string;
  metadataFields?: string[];
}

export const Audited = (
  eventType: string,
  options?: Omit<AuditedOptions, 'eventType'>,
) => SetMetadata(AUDIT_EVENT_KEY, { eventType, ...options });
