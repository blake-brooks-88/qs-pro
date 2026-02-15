import { SetMetadata } from '@nestjs/common';
import type { AuditEventType } from '@qpp/shared-types';

export const AUDIT_EVENT_KEY = 'audit_event_type';

export interface AuditedOptions {
  eventType: AuditEventType;
  targetIdParam?: string;
  metadataFields?: string[];
}

export const Audited = (
  eventType: AuditEventType,
  options?: Omit<AuditedOptions, 'eventType'>,
) => SetMetadata(AUDIT_EVENT_KEY, { eventType, ...options });
