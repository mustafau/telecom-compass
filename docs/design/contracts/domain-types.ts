/**
 * Design-reference domain types. Authoritative runtime equivalents belong in
 * src/server/domain (M1+). Keep this file synchronized or replace it with a
 * generated documentation link. Validate external values with Zod at runtime;
 * these types alone do not validate data.
 */
export type ApiId = `TMF${number}`;
export type EntityKind =
  | 'customer' | 'product' | 'service' | 'resource'
  | 'troubleTicket' | 'serviceOrder' | 'productOrder';
export type EntityRef = {
  kind: EntityKind;
  id: string;
  apiId: ApiId;
  major: string;
};
export type SourceMeta = {
  deploymentId: string;
  profileRevision: string;
  contractRef: string;
  operationKey: string;
  retrievedAt: string; // validated ISO instant
  sourceUpdatedAt?: string;
  quality: 'fixture' | 'live';
};
export type StateValue = {
  raw: string;
  meaning: string | null; // only from a reviewed enum map; null means unknown
};
export type RecordBase = {
  ref: EntityRef;
  displayName?: string;
  source: SourceMeta;
  warnings: string[];
};
export type Page<T> = {
  items: T[];
  completeness: 'complete' | 'partial' | 'unknown';
  total?: number; // do not set zero when upstream omitted it
  nextCursor?: string; // internal opaque cursor, not an arbitrary upstream URL
  truncated: boolean;
  warnings: string[];
};
export type Customer = RecordBase & {
  status?: StateValue;
};
export type Product = RecordBase & {
  lifecycleState?: StateValue;
  realizingServices: EntityRef[];
  relationsComplete: boolean;
};
export type Service = RecordBase & {
  lifecycleState?: StateValue;
  enabled?: boolean;
  supportingResources: EntityRef[];
  serviceOrders: EntityRef[];
  relationsComplete: boolean;
};
export type Resource = RecordBase & {
  operationalState?: StateValue;
  // No raw equipment address or credentials in the generic model-facing DTO.
};
export type Estimate = {
  at: string;
  sourceUpdatedAt?: string;
  type: 'estimate';
  // Whether it is in the past is derived from an injected clock, not the model.
};
export type TroubleTicket = RecordBase & {
  status?: StateValue;
  severity?: string;
  customerVisibleDescription?: string;
  affectedEntities: EntityRef[];
  expectedResolution?: Estimate;
  relationsComplete: boolean;
};
export type ServiceOrder = RecordBase & {
  state?: StateValue;
  items: Array<{
    id: string;
    state?: StateValue;
    action?: string;
    service?: EntityRef;
    statedBlocker?: string;
  }>;
  itemsComplete: boolean;
  expectedCompletion?: Estimate;
};
export type Observation = {
  code: string; // allowlisted, e.g. SERVICE_DISABLED, RESOURCE_UNAVAILABLE
  summary: string; // deterministic projection of a permitted fact
  entities: EntityRef[];
  evidenceIds: string[];
};
export type DiagnosticResult = {
  service: Service;
  observations: Observation[];
  resources: Page<Resource>;
  tickets: Page<TroubleTicket>;
  orders: Page<ServiceOrder>;
  gaps: Array<{ capability: string; reason: string }>;
  conflicts: Array<{ field: string; evidenceIds: string[] }>;
};
export type EvidenceRecord = {
  id: string;
  tenantId: string;
  conversationId: string;
  turnId: string;
  deploymentId: string;
  profileRevision: string;
  kind: 'tmf-record' | 'document';
  entity?: EntityRef;
  fields: Record<string, unknown>; // validate against kind-specific allowlist
  visibility: 'customer' | 'operator';
  retrievedAt: string;
  sourceUpdatedAt?: string;
  validFrom?: string;
  validTo?: string;
  quality: 'fixture' | 'live';
  sourceLocator: string; // server-only locator; never blindly dereferenced
};
