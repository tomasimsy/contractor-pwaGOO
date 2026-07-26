/**
 * Layer 1 — THE global filtering system. One filter engine for the
 * whole application, not one per page. This is the "Filter Service" in
 * the required flow:
 *
 *   Database -> Filter Service -> Financial Engine -> Dashboard / Tax / Reports
 *
 * Concretely: a page builds a `Filter` (types.ts) against whatever
 * fields it cares about (company, user, project, customer, estimate,
 * invoice, payment, expense, agent, subcontractor, vendor, category,
 * status, dates, amount ranges, or any relationship between them) and
 * passes it to FinancialEngine, which passes it straight through to
 * this service. No page builds its own query/filter logic — that was
 * the exact duplication problem across contractor-pwa's 15+
 * calculation sites, just one layer up (page-specific FILTER logic
 * instead of page-specific CALCULATION logic — same disease).
 *
 * ============================================================
 * SCHEMA-AWARE, NOT ENTITY-AWARE
 * ============================================================
 * This service does not contain the words "invoice" or "subcontractor"
 * anywhere in its logic. Every operation — validate, canonicalize,
 * execute — is generic over whatever SchemaRegistry (schemaRegistry.ts)
 * describes. "The list above is only examples... support future
 * database growth" is satisfied structurally: a new table is filterable
 * everywhere the moment it's registered in SchemaRegistry and has a
 * QueryExecutor registered here — nothing in this file changes.
 *
 * ============================================================
 * DETERMINISM: "the same filter must always produce the same results"
 * ============================================================
 * Two guarantees make this true:
 *  1. canonicalize() is a pure function: same input Filter (as a value,
 *     regardless of key/condition order at construction time) always
 *     produces the same ResolvedFilter and the same cacheKey.
 *  2. execute() is a pure function of (entity, scope, ResolvedFilter) —
 *     no wall-clock reads, no randomness. A caller wanting "the last 30
 *     days" must resolve that to concrete dates before building the
 *     Filter (see FilterCondition's doc comment in types.ts); this
 *     service never interprets a relative expression, so it can never
 *     answer the same nominal request two different ways depending on
 *     when it's asked.
 * Together: identical Filter + identical scope + identical underlying
 * data => identical results, always. A different result across two
 * calls means the DATA changed, never that the filter was reinterpreted.
 */
import { SchemaRegistry, type ColumnType } from "./schemaRegistry";
import type {
  QueryScope,
  DateRange,
  ISODateTime,
  Filter,
  FilterGroup,
  FilterCondition,
  FilterOperator,
  ResolvedFilter,
  QueryExecutor,
  ValidationResult,
  ValidationIssue,
} from "./types";

/** Applied identically regardless of which soft-delete convention the
 * underlying table uses (deleted_at timestamp vs legacy is_deleted
 * boolean) — the service hides that inconsistency from every caller. */
export interface SoftDeleteFilter {
  column: "deleted_at" | "is_deleted";
  activeValue: null | false;
}

export interface FilteringService {
  // ---------------------------------------------------------------
  // Schema introspection — lets a generic "add filter" UI enumerate
  // real, current options instead of a hard-coded list per page.
  // ---------------------------------------------------------------
  listEntities(): string[];
  listFilterableFields(entity: string, maxDepth?: number): Array<{ path: string; type: ColumnType }>;

  // ---------------------------------------------------------------
  // Validation + determinism
  // ---------------------------------------------------------------
  /** Checks every condition's path resolves in SchemaRegistry against
   * `entity`, and that `operator`/`value` are legal for that column's
   * type (e.g. "contains" only on string columns, "between" needs a
   * 2-tuple, an enum column's value must be one of its declared
   * values). Bad filters fail here, loudly, before ever reaching a
   * data query — never as a silently-empty result set. */
  validate(entity: string, filter: Filter): ValidationResult;

  /** Recursively sorts a validated Filter into one canonical order and
   * computes a stable cacheKey — see the file header's determinism
   * guarantee. Throws if `validate` would have failed; callers that
   * want to surface validation errors to a user should call `validate`
   * first. */
  canonicalize(entity: string, filter: Filter): ResolvedFilter;

  // ---------------------------------------------------------------
  // Execution — delegates to whichever Layer 2 service registered
  // itself for `entity`. FilterService never queries Supabase itself.
  // ---------------------------------------------------------------
  registerExecutor<T>(executor: QueryExecutor<T>): void;

  /** THE call every Layer 2/3 consumer makes instead of writing its own
   * query. Resolves `filter` (if given) via canonicalize(), applies
   * scope (company/project/date-range/soft-delete) first, then hands
   * off to the registered executor for `entity`. */
  execute<T>(entity: string, scope: QueryScope, filter?: Filter): Promise<T[]>;

  // ---------------------------------------------------------------
  // Existing primitives — unchanged, still the single implementation
  // every executor uses internally for soft-delete/date/scope handling.
  // ---------------------------------------------------------------
  activeFilterFor(tableName: string): SoftDeleteFilter;
  isActive<T extends { deletedAt?: ISODateTime | null }>(row: T): boolean;
  inRange(dateStr: string | null | undefined, range: DateRange): boolean;
  resolveScope(scope: QueryScope): Required<Pick<QueryScope, "companyId">> & QueryScope;
}

// ============================================================
// Implementation
// ============================================================

const SOFT_DELETE_LEGACY_TABLES = new Set(["estimates", "invoices"]); // is_deleted boolean, not deleted_at

function isCondition(node: FilterCondition | FilterGroup): node is FilterCondition {
  return "path" in node;
}

/** Deterministic string key for any value — sorts object keys so two
 * structurally-equal filters serialize identically regardless of the
 * order their conditions/fields were constructed in. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const OPERATORS_REQUIRING_ARRAY: FilterOperator[] = ["in", "notIn"];
const OPERATORS_REQUIRING_PAIR: FilterOperator[] = ["between"];
const OPERATORS_REQUIRING_NO_VALUE: FilterOperator[] = ["isNull", "isNotNull"];
const STRING_ONLY_OPERATORS: FilterOperator[] = ["contains", "startsWith"];
const ORDERED_ONLY_OPERATORS: FilterOperator[] = ["gt", "gte", "lt", "lte", "between"];

function validateCondition(entity: string, condition: FilterCondition, issues: ValidationIssue[]): void {
  let column;
  try {
    ({ column } = SchemaRegistry.resolvePath(entity, condition.path));
  } catch (err) {
    issues.push({ field: condition.path, code: "unknown_path", message: (err as Error).message });
    return;
  }

  if (STRING_ONLY_OPERATORS.includes(condition.operator) && column.type !== "string") {
    issues.push({
      field: condition.path,
      code: "operator_type_mismatch",
      message: `"${condition.operator}" is only valid on string columns; "${condition.path}" is ${column.type}.`,
    });
  }

  if (ORDERED_ONLY_OPERATORS.includes(condition.operator) && !["number", "date", "datetime"].includes(column.type)) {
    issues.push({
      field: condition.path,
      code: "operator_type_mismatch",
      message: `"${condition.operator}" requires an orderable column (number/date/datetime); "${condition.path}" is ${column.type}.`,
    });
  }

  if (OPERATORS_REQUIRING_ARRAY.includes(condition.operator) && !Array.isArray(condition.value)) {
    issues.push({ field: condition.path, code: "value_shape", message: `"${condition.operator}" requires an array value.` });
  }

  if (OPERATORS_REQUIRING_PAIR.includes(condition.operator) && (!Array.isArray(condition.value) || condition.value.length !== 2)) {
    issues.push({ field: condition.path, code: "value_shape", message: `"between" requires a 2-element [min, max] value.` });
  }

  if (OPERATORS_REQUIRING_NO_VALUE.includes(condition.operator) && condition.value !== undefined) {
    issues.push({ field: condition.path, code: "value_shape", message: `"${condition.operator}" must not include a value.` });
  }

  if (column.type === "enum" && column.enumValues && condition.value !== undefined) {
    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    for (const v of values) {
      if (typeof v === "string" && !column.enumValues.includes(v)) {
        issues.push({
          field: condition.path,
          code: "invalid_enum_value",
          message: `"${v}" is not a valid value for "${condition.path}" (expected one of: ${column.enumValues.join(", ")}).`,
        });
      }
    }
  }
}

function validateGroup(entity: string, group: FilterGroup, issues: ValidationIssue[]): void {
  for (const node of group.conditions) {
    if (isCondition(node)) validateCondition(entity, node, issues);
    else validateGroup(entity, node, issues);
  }
}

function canonicalizeGroup(group: FilterGroup): ResolvedFilter {
  const conditions: Array<FilterCondition | ResolvedFilter> = group.conditions
    .map((node) => (isCondition(node) ? node : canonicalizeGroup(node)))
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  const withoutKey = { op: group.op, conditions };
  return { ...withoutKey, cacheKey: stableStringify(withoutKey) };
}

export function createFilteringService(): FilteringService {
  const executors = new Map<string, QueryExecutor<unknown>>();

  function activeFilterFor(tableName: string): SoftDeleteFilter {
    return SOFT_DELETE_LEGACY_TABLES.has(tableName)
      ? { column: "is_deleted", activeValue: false }
      : { column: "deleted_at", activeValue: null };
  }

  function isActive<T extends { deletedAt?: ISODateTime | null }>(row: T): boolean {
    return !row.deletedAt;
  }

  function inRange(dateStr: string | null | undefined, range: DateRange): boolean {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= range.start && d < range.end;
  }

  function resolveScope(scope: QueryScope): Required<Pick<QueryScope, "companyId">> & QueryScope {
    if (!scope.companyId) {
      throw new Error("FilteringService.resolveScope: companyId is required on every scope — tenant isolation is not optional.");
    }
    return { ...scope, includeDeleted: scope.includeDeleted ?? false };
  }

  function listEntities(): string[] {
    return SchemaRegistry.list();
  }

  function listFilterableFields(entity: string, maxDepth = 2) {
    return SchemaRegistry.listFilterableFields(entity, maxDepth);
  }

  function validate(entity: string, filter: Filter): ValidationResult {
    const issues: ValidationIssue[] = [];
    if (!SchemaRegistry.has(entity)) {
      return { valid: false, issues: [{ field: "entity", code: "unknown_entity", message: `"${entity}" is not registered in SchemaRegistry.` }] };
    }
    validateGroup(entity, filter, issues);
    return { valid: issues.length === 0, issues };
  }

  function canonicalize(entity: string, filter: Filter): ResolvedFilter {
    const result = validate(entity, filter);
    if (!result.valid) {
      throw new Error(
        `FilteringService.canonicalize: invalid filter for "${entity}": ${result.issues.map((i) => i.message).join("; ")}`
      );
    }
    return canonicalizeGroup(filter);
  }

  function registerExecutor<T>(executor: QueryExecutor<T>): void {
    if (!SchemaRegistry.has(executor.entity)) {
      throw new Error(
        `FilteringService.registerExecutor: "${executor.entity}" has no SchemaRegistry entry. Register its EntitySchema before registering an executor for it.`
      );
    }
    executors.set(executor.entity, executor as QueryExecutor<unknown>);
  }

  async function execute<T>(entity: string, scope: QueryScope, filter?: Filter): Promise<T[]> {
    const resolvedScope = resolveScope(scope);
    const executor = executors.get(entity);
    if (!executor) {
      throw new Error(
        `FilteringService.execute: no QueryExecutor registered for "${entity}". Every Layer 2 service must call registerExecutor() for the entity/entities it owns.`
      );
    }
    const resolvedFilter = filter ? canonicalize(entity, filter) : null;
    return executor.query(resolvedScope, resolvedFilter) as Promise<T[]>;
  }

  return {
    listEntities,
    listFilterableFields,
    validate,
    canonicalize,
    registerExecutor,
    execute,
    activeFilterFor,
    isActive,
    inRange,
    resolveScope,
  };
}
