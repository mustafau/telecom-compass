import "../../guard";
import { z } from "zod";

const bindingSourceSchema = z.enum([
  "context.targetCustomerId",
  "args.serviceId",
  "args.productId",
  "args.customerId",
  "args.resourceId",
  "args.ticketId",
  "args.orderId",
  "args.id",
]);

const queryParamSchema = z.object({
  name: z.string().min(1),
  source: bindingSourceSchema,
  type: z.enum(["string", "integer", "boolean"]),
});

const paginationSchema = z.object({
  mode: z.enum(["offset", "cursor"]),
  offsetParam: z.string().optional(),
  limitParam: z.string().optional(),
  cursorParam: z.string().optional(),
  totalHeader: z.string().optional(),
  maxPageSize: z.number().int().positive().max(50).default(50),
  maxPages: z.number().int().positive().max(2).default(2),
});

export const operationSchema = z.object({
  method: z.literal("GET"),
  path: z
    .string()
    .min(1)
    .regex(/^\/[A-Za-z0-9_\-./{}]+$/, "path must be a fixed route template"),
  responseKind: z.string().min(1),
  query: z.array(queryParamSchema).default([]),
  pagination: paginationSchema.optional(),
});

const authNoneSchema = z.object({ type: z.literal("none") });
const authBearerSchema = z.object({
  type: z.literal("bearer"),
  tokenSecretRef: z.string().min(1),
});
const authOauthSchema = z.object({
  type: z.literal("oauth2-client-credentials"),
  tokenUrl: z.string().url(),
  clientIdSecretRef: z.string().min(1),
  clientSecretRef: z.string().min(1),
  scopes: z.array(z.string()).default([]),
});

export const authBindingSchema = z.discriminatedUnion("type", [
  authNoneSchema,
  authBearerSchema,
  authOauthSchema,
]);

export const apiEntrySchema = z.object({
  apiId: z.string().regex(/^TMF\d+$/),
  major: z.enum(["v4", "v5"]),
  contractRef: z.string().min(1),
  adapter: z.string().min(1),
  baseUrl: z.string().url(),
  auth: z.string().min(1),
  operations: z.record(operationSchema),
});

const referencePlanSchema = z.object({
  type: z.literal("reference"),
  normalizedField: z.string().min(1),
  targetOperation: z.string().min(1),
});

const queryPlanSchema = z.object({
  type: z.literal("query"),
  operation: z.string().min(1),
});

const viaPlanSchema = z.object({
  type: z.literal("via"),
  steps: z.array(z.string().min(1)).min(1).max(3),
});

export const relationshipPlanSchema = z.discriminatedUnion("type", [
  referencePlanSchema,
  queryPlanSchema,
  viaPlanSchema,
]);

const capabilitiesSchema = z.object({
  customerRead: z.boolean().default(false),
  productRead: z.boolean().default(false),
  serviceRead: z.boolean().default(false),
  resourceRead: z.boolean().default(false),
  ticketRead: z.boolean().default(false),
  serviceOrderRead: z.boolean().default(false),
  customerToServices: z.boolean().default(false),
  serviceToTickets: z.boolean().default(false),
  serviceToOrders: z.boolean().default(false),
  knowledgeSearch: z.boolean().default(false),
});

const knowledgeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("disabled") }),
  z.object({
    type: z.literal("markdown-corpus"),
    root: z.string().min(1),
  }),
]);

export const deploymentProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  environment: z.enum(["fixture", "live"]),
  tenantBindings: z.array(z.string().min(1)).min(1),
  authentication: z.record(authBindingSchema),
  apis: z.record(apiEntrySchema),
  capabilities: capabilitiesSchema,
  relationships: z.record(relationshipPlanSchema).default({}),
  extensions: z.array(z.unknown()).default([]),
  knowledge: knowledgeSchema,
  limits: z.object({
    maxRelatedRecordsPerKind: z.number().int().positive().max(50).default(5),
    maxRelationshipDepth: z.number().int().positive().max(3).default(3),
    maxResponseBytes: z.number().int().positive().max(1_048_576).default(1_048_576),
  }),
});

export const deploymentsFileSchema = z.object({
  schemaVersion: z.literal(1),
  deployments: z.array(deploymentProfileSchema).min(1),
});

export type DeploymentProfile = z.infer<typeof deploymentProfileSchema>;
export type DeploymentsFile = z.infer<typeof deploymentsFileSchema>;
export type OperationDef = z.infer<typeof operationSchema>;
export type ApiEntry = z.infer<typeof apiEntrySchema>;
export type RelationshipPlan = z.infer<typeof relationshipPlanSchema>;
export type AuthBinding = z.infer<typeof authBindingSchema>;
export type CapabilityFlags = z.infer<typeof capabilitiesSchema>;
