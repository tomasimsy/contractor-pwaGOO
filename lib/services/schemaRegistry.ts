/**
 * Layer 0 — the schema knowledge FilterService is built on. This is
 * DATA, not filtering logic: a description of every entity's columns
 * (name + type), relationships (what it joins to and how), and whether
 * it's company-scoped. Nothing here executes a query.
 *
 * WHY THIS EXISTS: the brief requires one filtering system, not one
 * per page, and requires it to "support future database growth." A
 * hand-written switch/if-chain of "if entity is invoices, filter by
 * these 6 fields" is exactly a per-page filter system wearing a
 * disguise — it still needs a code change for every new field or
 * table. Registering a new EntitySchema here is the ONLY change needed
 * to make a new table (or a new column on an existing one) filterable
 * everywhere FilterService is used — Dashboard, Tax, Reports, and
 * anything built after this file, with no code change to
 * FilterService, FinancialEngine, or any consuming page.
 *
 * This is the encoded result of the schema inspection already done
 * against contractor-pwa (tables, columns, relationships, data types —
 * see ARCHITECTURE_MIGRATION_PLAN.md) plus the project-centered shape
 * from the redesign. Every entity below is real, not speculative.
 */

export type ColumnType = "uuid" | "string" | "number" | "boolean" | "date" | "datetime" | "enum";

export interface EntityColumn {
  name: string;
  type: ColumnType;
  nullable: boolean;
  /** Only set when type is "enum" — the closed value set, so an
   * invalid filter value (a typo'd status) is a validation error at
   * the FilterService layer, not a query that silently returns zero
   * rows for the wrong reason. */
  enumValues?: readonly string[];
}

export type RelationshipCardinality = "one" | "many";

export interface EntityRelationship {
  /** The name used in a filter path, e.g. "client" in "client.name". */
  name: string;
  targetEntity: string; // must match another EntitySchema.name
  cardinality: RelationshipCardinality;
  /** The column (on THIS entity for "one", on the TARGET entity for
   * "many") that carries the foreign key. */
  foreignKey: string;
}

export interface EntitySchema {
  name: string;
  companyScoped: boolean; // true for every entity except companies/profiles-across-companies
  columns: EntityColumn[];
  relationships: EntityRelationship[];
}

/**
 * Registry of every filterable entity. `register` is the ONE
 * extension point for future database growth — adding a table means
 * calling this once, anywhere (a migration companion file, a codegen
 * step reading actual Postgres information_schema, or by hand as
 * below). FilterService never hard-codes an entity name.
 */
class SchemaRegistryImpl {
  private entities = new Map<string, EntitySchema>();

  register(schema: EntitySchema): void {
    this.entities.set(schema.name, schema);
  }

  get(entityName: string): EntitySchema {
    const schema = this.entities.get(entityName);
    if (!schema) {
      throw new Error(
        `SchemaRegistry: unknown entity "${entityName}". If this is a new table, register its EntitySchema before filtering on it — see schemaRegistry.ts.`
      );
    }
    return schema;
  }

  has(entityName: string): boolean {
    return this.entities.has(entityName);
  }

  list(): string[] {
    return Array.from(this.entities.keys());
  }

  getColumn(entityName: string, columnName: string): EntityColumn {
    const schema = this.get(entityName);
    const column = schema.columns.find((c) => c.name === columnName);
    if (!column) {
      throw new Error(`SchemaRegistry: entity "${entityName}" has no column "${columnName}".`);
    }
    return column;
  }

  getRelationship(entityName: string, relationshipName: string): EntityRelationship {
    const schema = this.get(entityName);
    const rel = schema.relationships.find((r) => r.name === relationshipName);
    if (!rel) {
      throw new Error(`SchemaRegistry: entity "${entityName}" has no relationship "${relationshipName}".`);
    }
    return rel;
  }

  /**
   * Resolves a dot path ("client.name", "project.client.id") against
   * the registry, walking relationships, and returns the terminal
   * column plus the chain of entities traversed. This is what lets a
   * filter reach across tables generically — FilterService never
   * special-cases "invoices filtered by client name," it just resolves
   * whatever path it's given.
   */
  resolvePath(rootEntity: string, path: string): { column: EntityColumn; entityChain: string[] } {
    const segments = path.split(".");
    let currentEntity = rootEntity;
    const entityChain = [rootEntity];

    for (let i = 0; i < segments.length - 1; i++) {
      const rel = this.getRelationship(currentEntity, segments[i]);
      currentEntity = rel.targetEntity;
      entityChain.push(currentEntity);
    }

    const column = this.getColumn(currentEntity, segments[segments.length - 1]);
    return { column, entityChain };
  }

  /** Every directly-filterable field on an entity, flattened up to
   * `maxDepth` relationship hops — this is what lets a generic "add a
   * filter" UI enumerate options without hard-coding them, and what
   * makes a newly-registered entity/column immediately show up
   * everywhere with zero UI code change. */
  listFilterableFields(entityName: string, maxDepth = 2): Array<{ path: string; type: ColumnType }> {
    const results: Array<{ path: string; type: ColumnType }> = [];
    const walk = (entity: string, prefix: string, depth: number, seen: Set<string>) => {
      if (seen.has(entity)) return; // guard against relationship cycles
      const schema = this.get(entity);
      for (const col of schema.columns) {
        results.push({ path: prefix ? `${prefix}.${col.name}` : col.name, type: col.type });
      }
      if (depth >= maxDepth) return;
      for (const rel of schema.relationships) {
        walk(rel.targetEntity, prefix ? `${prefix}.${rel.name}` : rel.name, depth + 1, new Set(seen).add(entity));
      }
    };
    walk(entityName, "", 0, new Set());
    return results;
  }
}

export const SchemaRegistry = new SchemaRegistryImpl();

// ============================================================
// SEED DATA — every entity known at rebuild time. Extend by calling
// SchemaRegistry.register() elsewhere for anything added later; this
// block is not a special hard-coded path, it's just the first caller.
// ============================================================

SchemaRegistry.register({
  name: "companies",
  companyScoped: false,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "name", type: "string", nullable: false },
  ],
  relationships: [],
});

SchemaRegistry.register({
  name: "users", // profiles
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "role", type: "enum", nullable: false, enumValues: ["owner", "member"] },
  ],
  relationships: [{ name: "company", targetEntity: "companies", cardinality: "one", foreignKey: "company_id" }],
});

SchemaRegistry.register({
  name: "customers", // clients
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "name", type: "string", nullable: false },
    { name: "email", type: "string", nullable: true },
    { name: "phone", type: "string", nullable: true },
    { name: "created_at", type: "datetime", nullable: false },
    { name: "deleted_at", type: "datetime", nullable: true },
  ],
  relationships: [],
});

SchemaRegistry.register({
  name: "projects",
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "client_id", type: "uuid", nullable: true },
    { name: "assigned_user_id", type: "uuid", nullable: true },
    { name: "name", type: "string", nullable: false },
    {
      name: "status",
      type: "enum",
      nullable: false,
      enumValues: ["draft", "active", "in_progress", "on_hold", "completed", "cancelled", "archived"],
    },
    { name: "start_date", type: "date", nullable: true },
    { name: "end_date", type: "date", nullable: true },
    { name: "created_at", type: "datetime", nullable: false },
    { name: "deleted_at", type: "datetime", nullable: true },
  ],
  relationships: [
    { name: "customer", targetEntity: "customers", cardinality: "one", foreignKey: "client_id" },
    { name: "assignedUser", targetEntity: "users", cardinality: "one", foreignKey: "assigned_user_id" },
    { name: "estimates", targetEntity: "estimates", cardinality: "many", foreignKey: "project_id" },
    { name: "invoices", targetEntity: "invoices", cardinality: "many", foreignKey: "project_id" },
    { name: "expenses", targetEntity: "expenses", cardinality: "many", foreignKey: "project_id" },
    { name: "changeOrders", targetEntity: "change_orders", cardinality: "many", foreignKey: "project_id" },
  ],
});

SchemaRegistry.register({
  name: "estimates",
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "project_id", type: "uuid", nullable: false },
    { name: "client_id", type: "uuid", nullable: true },
    {
      name: "status",
      type: "enum",
      nullable: false,
      enumValues: ["draft", "sent", "viewed", "approved", "rejected", "converted_to_invoice"],
    },
    { name: "total", type: "number", nullable: false },
    { name: "created_at", type: "datetime", nullable: false },
    { name: "deleted_at", type: "datetime", nullable: true },
  ],
  relationships: [
    { name: "project", targetEntity: "projects", cardinality: "one", foreignKey: "project_id" },
    { name: "customer", targetEntity: "customers", cardinality: "one", foreignKey: "client_id" },
  ],
});

SchemaRegistry.register({
  name: "change_orders",
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "project_id", type: "uuid", nullable: false },
    { name: "status", type: "enum", nullable: false, enumValues: ["draft", "pending", "approved", "rejected", "invoiced"] },
    { name: "total_amount", type: "number", nullable: false },
    { name: "approved_at", type: "datetime", nullable: true },
    { name: "created_at", type: "datetime", nullable: false },
  ],
  relationships: [{ name: "project", targetEntity: "projects", cardinality: "one", foreignKey: "project_id" }],
});

SchemaRegistry.register({
  name: "invoices",
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "project_id", type: "uuid", nullable: false },
    { name: "estimate_id", type: "uuid", nullable: true },
    { name: "client_id", type: "uuid", nullable: true },
    { name: "status", type: "enum", nullable: false, enumValues: ["pending", "signed", "partial", "paid"] },
    { name: "total", type: "number", nullable: false },
    { name: "issue_date", type: "date", nullable: true },
    { name: "due_date", type: "date", nullable: true },
    { name: "created_at", type: "datetime", nullable: false },
    { name: "deleted_at", type: "datetime", nullable: true },
  ],
  relationships: [
    { name: "project", targetEntity: "projects", cardinality: "one", foreignKey: "project_id" },
    { name: "customer", targetEntity: "customers", cardinality: "one", foreignKey: "client_id" },
    { name: "payments", targetEntity: "payments", cardinality: "many", foreignKey: "invoice_id" },
  ],
});

SchemaRegistry.register({
  name: "payments", // invoice_payments
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "invoice_id", type: "uuid", nullable: false },
    { name: "amount", type: "number", nullable: false },
    { name: "method", type: "string", nullable: false },
    { name: "payment_date", type: "date", nullable: false },
    { name: "created_at", type: "datetime", nullable: false },
    { name: "deleted_at", type: "datetime", nullable: true },
  ],
  relationships: [{ name: "invoice", targetEntity: "invoices", cardinality: "one", foreignKey: "invoice_id" }],
});

SchemaRegistry.register({
  name: "expenses", // estimate_expenses
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "project_id", type: "uuid", nullable: false },
    { name: "category", type: "enum", nullable: false, enumValues: ["material", "labor", "other"] },
    { name: "amount", type: "number", nullable: false },
    { name: "vendor", type: "string", nullable: true },
    { name: "expense_date", type: "date", nullable: false },
    { name: "paid_by_agent_id", type: "uuid", nullable: true },
    { name: "created_at", type: "datetime", nullable: false },
    { name: "deleted_at", type: "datetime", nullable: true },
  ],
  relationships: [
    { name: "project", targetEntity: "projects", cardinality: "one", foreignKey: "project_id" },
    { name: "vendor_ref", targetEntity: "vendors", cardinality: "one", foreignKey: "vendor" },
    { name: "paidByAgent", targetEntity: "agents", cardinality: "one", foreignKey: "paid_by_agent_id" },
  ],
});

// Vendors don't have a dedicated table yet in the source app (`vendor`
// is a free-text column on estimate_expenses) — registered here as its
// own entity anyway, per the brief's explicit example list, so the
// filter system already understands "vendor" as a first-class concept.
// If/when a real `vendors` table is added, only this entry needs to
// change (columns/relationships filled in) — nothing that filters by
// vendor today has to be rewritten.
SchemaRegistry.register({
  name: "vendors",
  companyScoped: true,
  columns: [
    { name: "id", type: "string", nullable: false }, // currently the free-text vendor name itself
    { name: "company_id", type: "uuid", nullable: false },
  ],
  relationships: [],
});

SchemaRegistry.register({
  name: "subcontractors",
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "name", type: "string", nullable: false },
    { name: "trade", type: "string", nullable: true },
  ],
  relationships: [{ name: "assignments", targetEntity: "subcontractor_assignments", cardinality: "many", foreignKey: "subcontractor_id" }],
});

SchemaRegistry.register({
  name: "subcontractor_assignments", // estimate_subcontractors
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "project_id", type: "uuid", nullable: false },
    { name: "subcontractor_id", type: "uuid", nullable: false },
    { name: "amount", type: "number", nullable: false },
    { name: "is_final", type: "boolean", nullable: false },
  ],
  relationships: [
    { name: "project", targetEntity: "projects", cardinality: "one", foreignKey: "project_id" },
    { name: "subcontractor", targetEntity: "subcontractors", cardinality: "one", foreignKey: "subcontractor_id" },
  ],
});

SchemaRegistry.register({
  name: "agents",
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "name", type: "string", nullable: false },
    { name: "commission_rate", type: "number", nullable: true },
  ],
  relationships: [{ name: "assignments", targetEntity: "agent_assignments", cardinality: "many", foreignKey: "agent_id" }],
});

SchemaRegistry.register({
  name: "agent_assignments", // estimate_agents
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "project_id", type: "uuid", nullable: false },
    { name: "agent_id", type: "uuid", nullable: false },
    { name: "assigned_amount", type: "number", nullable: false },
  ],
  relationships: [
    { name: "project", targetEntity: "projects", cardinality: "one", foreignKey: "project_id" },
    { name: "agent", targetEntity: "agents", cardinality: "one", foreignKey: "agent_id" },
  ],
});

SchemaRegistry.register({
  name: "financial_transactions",
  companyScoped: true,
  columns: [
    { name: "id", type: "uuid", nullable: false },
    { name: "company_id", type: "uuid", nullable: false },
    { name: "project_id", type: "uuid", nullable: true },
    {
      name: "type",
      type: "enum",
      nullable: false,
      enumValues: [
        "invoice_issued", "change_order_approved", "customer_payment",
        "material_expense", "labor_expense", "other_expense", "mileage_expense",
        "subcontractor_payment", "agent_commission",
        "agent_reimbursement_owed", "agent_reimbursement_paid", "adjustment",
      ],
    },
    { name: "amount", type: "number", nullable: false },
    { name: "reference_id", type: "uuid", nullable: false },
    { name: "reference_type", type: "string", nullable: false },
    { name: "created_by", type: "uuid", nullable: true },
    { name: "created_at", type: "datetime", nullable: false },
  ],
  relationships: [{ name: "project", targetEntity: "projects", cardinality: "one", foreignKey: "project_id" }],
});
