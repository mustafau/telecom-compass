import "../../guard";
import type { EntityRef, Page } from "../../domain/types";
import type { NormalizedEntity } from "../adapters/types";
import { TmfError } from "../errors";
import type { CheckedProfile } from "../profile/revision";
import type { RelationshipPlan } from "../profile/schema";
import type { TmfGateway } from "../gateway";

export type RelationshipResult = {
  refs: EntityRef[];
  completeness: Page<EntityRef>["completeness"];
  truncated: boolean;
  warnings: string[];
  provenance: string[];
};

export type RelationshipResolver = {
  resolve(
    planName: string,
    source: NormalizedEntity,
    bindings?: Record<string, string>,
  ): Promise<RelationshipResult>;
};

function readEntityRefField(
  source: NormalizedEntity,
  field: string,
): EntityRef[] | undefined {
  const record = source as unknown as Record<string, unknown>;
  const value = record[field];
  if (!Array.isArray(value)) return undefined;
  if (
    value.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string",
    )
  ) {
    return value as EntityRef[];
  }
  return undefined;
}

export function createRelationshipResolver(
  profile: CheckedProfile,
  gateway: TmfGateway,
): RelationshipResolver {
  return {
    async resolve(planName, source, bindings = {}) {
      const plan = profile.relationships[planName];
      if (!plan) {
        throw new TmfError(
          "RELATIONSHIP_UNAVAILABLE",
          `Relationship plan not configured: ${planName}`,
        );
      }
      return executePlan(planName, plan, source, profile, gateway, bindings, []);
    },
  };
}

async function executePlan(
  planName: string,
  plan: RelationshipPlan,
  source: NormalizedEntity,
  profile: CheckedProfile,
  gateway: TmfGateway,
  bindings: Record<string, string>,
  provenance: string[],
): Promise<RelationshipResult> {
  const nextProvenance = [...provenance, planName];
  if (nextProvenance.length > profile.limits.maxRelationshipDepth) {
    throw new TmfError("RELATIONSHIP_UNAVAILABLE", `Relationship depth exceeded at ${planName}`);
  }

  switch (plan.type) {
    case "reference": {
      const value = readEntityRefField(source, plan.normalizedField);
      if (!value) {
        return {
          refs: [],
          completeness: "unknown",
          truncated: false,
          warnings: [`Normalized field ${plan.normalizedField} unavailable`],
          provenance: nextProvenance,
        };
      }
      const refs = value.slice(0, profile.limits.maxRelatedRecordsPerKind);
      const relationsComplete =
        "relationsComplete" in source ? Boolean(source.relationsComplete) : false;
      return {
        refs,
        completeness: relationsComplete ? "complete" : "unknown",
        truncated: value.length > refs.length,
        warnings: [],
        provenance: nextProvenance,
      };
    }
    case "query": {
      const args: Record<string, string> = {
        ...bindings,
        "args.serviceId": source.ref.id,
        "args.productId": source.ref.id,
        "args.customerId": source.ref.id,
        "args.id": source.ref.id,
      };
      if (source.ref.kind === "service") {
        args["args.serviceId"] = source.ref.id;
      }
      const result = await gateway.read(plan.operation, args);
      const entities = Array.isArray(result.data) ? result.data : [result.data];
      const refs = entities.map((entity) => entity.ref).slice(
        0,
        profile.limits.maxRelatedRecordsPerKind,
      );
      return {
        refs,
        completeness: entities.length < profile.limits.maxRelatedRecordsPerKind ? "complete" : "partial",
        truncated: entities.length > refs.length,
        warnings: [],
        provenance: nextProvenance,
      };
    }
    case "via": {
      let currentEntities: NormalizedEntity[] = [source];
      const warnings: string[] = [];
      let truncated = false;
      let completeness: Page<EntityRef>["completeness"] = "complete";

      for (const step of plan.steps) {
        const stepPlan = profile.relationships[step];
        if (!stepPlan) {
          throw new TmfError("RELATIONSHIP_UNAVAILABLE", `Missing via step ${step}`);
        }
        const nextEntities: NormalizedEntity[] = [];
        for (const entity of currentEntities) {
          const stepResult = await executePlan(
            step,
            stepPlan,
            entity,
            profile,
            gateway,
            bindings,
            nextProvenance,
          );
          warnings.push(...stepResult.warnings);
          truncated = truncated || stepResult.truncated;
          if (stepResult.completeness !== "complete") completeness = stepResult.completeness;

          if (stepPlan.type === "reference") {
            for (const ref of stepResult.refs) {
              const fetched = await gateway.read(stepPlan.targetOperation, {
                id: ref.id,
                "args.id": ref.id,
              });
              const data = Array.isArray(fetched.data) ? fetched.data[0] : fetched.data;
              if (data) nextEntities.push(data);
            }
          } else if (stepPlan.type === "query") {
            const fetched = await gateway.read(stepPlan.operation, {
              ...bindings,
              "args.serviceId": entity.ref.id,
              "args.customerId": entity.ref.id,
              "args.id": entity.ref.id,
            });
            const list = Array.isArray(fetched.data) ? fetched.data : [fetched.data];
            nextEntities.push(...list);
          } else {
            throw new TmfError(
              "RELATIONSHIP_UNAVAILABLE",
              `Via step ${step} must be reference or query`,
            );
          }
        }
        currentEntities = nextEntities.slice(0, profile.limits.maxRelatedRecordsPerKind);
        if (nextEntities.length > currentEntities.length) truncated = true;
      }

      return {
        refs: currentEntities.map((entity) => entity.ref),
        completeness,
        truncated,
        warnings,
        provenance: nextProvenance,
      };
    }
    default: {
      const _exhaustive: never = plan;
      throw new TmfError("RELATIONSHIP_UNAVAILABLE", `Unknown plan ${JSON.stringify(_exhaustive)}`);
    }
  }
}
