import "../guard";

export type ApiId = `TMF${number}`;
export type EntityKind =
  | "customer"
  | "product"
  | "service"
  | "resource"
  | "troubleTicket"
  | "serviceOrder"
  | "productOrder";

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
  retrievedAt: string;
  sourceUpdatedAt?: string;
  quality: "fixture" | "live";
};

export type StateValue = {
  raw: string;
  meaning: string | null;
};

export type RecordBase = {
  ref: EntityRef;
  displayName?: string;
  source: SourceMeta;
  warnings: string[];
};

export type Page<T> = {
  items: T[];
  completeness: "complete" | "partial" | "unknown";
  total?: number;
  nextCursor?: string;
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
};

export type Estimate = {
  at: string;
  sourceUpdatedAt?: string;
  type: "estimate";
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
