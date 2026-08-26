import "server-only";
import { Pool } from "pg";

type Row = Record<string, unknown>;
type Result = { data: Row[] | Row | null; error: Error | null; count?: number };

const IDENT = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const id = (value: string) => value.split(".").every((part) => IDENT.test(part)) ? value : (() => { throw new Error("Invalid database identifier"); })();

/**
 * `pg` serializes a bare JS array as a Postgres ARRAY literal ("{a,b}"), not
 * JSON — wrong for a JSONB column holding an array value (e.g. Contract
 * Criteria's `periods`), which produces "invalid input syntax for type json"
 * on insert/update. Plain arrays/objects are JSON.stringify'd before being
 * sent as a param; Date/Buffer/null and everything else pass through
 * unchanged (no real table column here is a native Postgres ARRAY type).
 */
function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) return JSON.stringify(value);
  return value;
}

let pool: Pool | null = null;
function getPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  if (!pool) pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX || 10), idleTimeoutMillis: 30_000 });
  return pool;
}

class QueryBuilder implements PromiseLike<Result> {
  private filters: string[] = [];
  private values: unknown[] = [];
  private orderBy = "";
  private limitValue?: number;
  private offsetValue?: number;
  private action: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private selected = "*";
  private wantCount = false;
  private head = false;
  private returning = false;
  private conflict?: string;

  constructor(private readonly table: string) { id(table); }
  select(columns = "*", options?: { count?: "exact"; head?: boolean }) { this.selected = columns; this.returning = this.action !== "select"; this.wantCount = options?.count === "exact"; this.head = options?.head === true; return this; }
  insert(values: Row | Row[]) { this.action = "insert"; this.payload = values; return this; }
  update(values: Row) { this.action = "update"; this.payload = values; return this; }
  delete() { this.action = "delete"; return this; }
  upsert(values: Row | Row[], options?: { onConflict?: string }) { this.action = "insert"; this.payload = values; this.conflict = options?.onConflict; return this; }
  eq(column: string, value: unknown) { return this.where(column, "=", value); }
  neq(column: string, value: unknown) { return this.where(column, "<>", value); }
  /** Supabase-compatible negated filter, e.g. not('status', 'ilike', 'inactive'). */
  not(column: string, operator: string, value: unknown) {
    const allowedOperators = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "ilike", "like", "is"]);
    if (!allowedOperators.has(operator)) throw new Error(`Unsupported filter operator: ${operator}`);
    const sqlOperator = operator === "eq" ? "=" : operator === "neq" ? "<>" : operator.toUpperCase();
    if (operator === "is") {
      this.filters.push(`NOT (${id(column)} IS ${value === null ? "NULL" : value ? "TRUE" : "FALSE"})`);
      return this;
    }
    this.filters.push(`NOT (${id(column)} ${sqlOperator} $${this.values.length + 1})`);
    this.values.push(value);
    return this;
  }
  gt(column: string, value: unknown) { return this.where(column, ">", value); }
  gte(column: string, value: unknown) { return this.where(column, ">=", value); }
  lt(column: string, value: unknown) { return this.where(column, "<", value); }
  lte(column: string, value: unknown) { return this.where(column, "<=", value); }
  ilike(column: string, value: string) { return this.where(column, "ILIKE", value); }
  in(column: string, values: unknown[]) { if (!values.length) { this.filters.push("FALSE"); return this; } this.filters.push(`${id(column)} = ANY($${this.values.length + 1})`); this.values.push(values); return this; }
  is(column: string, value: null | boolean) { this.filters.push(`${id(column)} IS ${value === null ? "NULL" : value ? "TRUE" : "FALSE"}`); return this; }
  or(expression: string) { const parts = expression.split(",").map((part) => part.match(/^([\w.]+)\.(ilike|eq)\.(.*)$/)).filter(Boolean) as RegExpMatchArray[]; if (parts.length) { const clauses = parts.map((p) => `${id(p[1])} ${p[2] === "ilike" ? "ILIKE" : "="} $${this.values.length + 1}`); this.filters.push(`(${clauses.join(" OR ")})`); parts.forEach((p) => this.values.push(p[2] === "ilike" ? p[3] : p[3])); } return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orderBy = ` ORDER BY ${id(column)} ${options?.ascending === false ? "DESC" : "ASC"}`; return this; }
  limit(value: number) { this.limitValue = value; return this; }
  range(from: number, to: number) { this.offsetValue = from; this.limitValue = to - from + 1; return this; }
  maybeSingle() { return this.run(true); }
  single() { return this.run(true); }
  private where(column: string, operator: string, value: unknown) { this.filters.push(`${id(column)} ${operator} $${this.values.length + 1}`); this.values.push(value); return this; }
  private async run(single: boolean): Promise<Result> { return this.execute(single); }
  async then<TResult1 = Result, TResult2 = never>(resolve?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> { return this.execute(false).then(resolve, reject); }
  private async execute(single: boolean): Promise<Result> {
    const client = await getPool().connect();
    try {
      const where = this.filters.length ? ` WHERE ${this.filters.join(" AND ")}` : "";
      let result;
      if (this.action === "select") {
        // Supabase supports embedding a related table in a select, for
        // example `calculated_attendance(id)`. The local PostgreSQL facade
        // must translate that shape to an equivalent correlated JSON value;
        // sending the Supabase selection literally is invalid SQL.
        const embeddedCalculated = this.table === "raw_attendance" && /(?:^|,)\s*calculated_attendance\(id\)\s*(?:,|$)/.test(this.selected);
        const embeddedRaw = this.table === "calculated_attendance"
          ? this.selected.match(/(?:^|,)\s*raw_attendance!inner\(([^)]*)\)\s*(?:,|$)/)
          : null;
        let columns = this.selected.includes("!") ? "*" : this.selected;
        let from = `FROM ${id(this.table)}`;
        if (embeddedCalculated) {
          const baseColumns = columns
            .replace(/(?:^|,)\s*calculated_attendance\(id\)\s*(?=,|$)/, "")
            .replace(/^\s*,\s*|\s*,\s*$/, "")
            .trim();
          columns = `${baseColumns || "*"}, (SELECT COALESCE(json_agg(json_build_object('id', ca.id)), '[]'::json) FROM calculated_attendance ca WHERE ca.raw_id = raw_attendance.id) AS calculated_attendance`;
        }
        if (embeddedRaw) {
          const rawColumns = embeddedRaw[1].split(",").map((column) => column.trim()).filter(Boolean);
          const rawJson = rawColumns.map((column) => `'${id(column)}', raw_attendance.${id(column)}`).join(", ");
          columns = `calculated_attendance.*, json_build_object(${rawJson}) AS raw_attendance`;
          from += " JOIN raw_attendance ON raw_attendance.id = calculated_attendance.raw_id";
        }
        const orderBy = embeddedRaw ? this.orderBy.replace(" ORDER BY id ", " ORDER BY calculated_attendance.id ") : this.orderBy;
        const sql = `SELECT ${columns} ${from}${where}${orderBy}${this.limitValue === undefined ? "" : ` LIMIT ${this.limitValue}`}${this.offsetValue === undefined ? "" : ` OFFSET ${this.offsetValue}`}`;
        result = await client.query(sql, this.values);
        const data = this.head ? null : (single ? (result.rows[0] ?? null) : result.rows);
        let count: number | undefined;
        if (this.wantCount) {
          const countResult = await client.query(`SELECT COUNT(*) AS count ${from}${where}`, this.values);
          count = Number(countResult.rows[0]?.count ?? 0);
        }
        return { data, error: null, count };
      }
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      const keys = Object.keys(rows[0]);
      const params = [...this.values];
      if (this.action === "insert") {
        const tuples = rows.map((row) => `(${keys.map((key) => { params.push(serializeValue(row[key])); return `$${params.length}`; }).join(",")})`);
        const conflict = this.conflict ? ` ON CONFLICT (${this.conflict.split(",").map(id).join(",")}) DO UPDATE SET ${keys.map((key) => `${id(key)} = EXCLUDED.${id(key)}`).join(",")}` : "";
        result = await client.query(`INSERT INTO ${id(this.table)} (${keys.map(id).join(",")}) VALUES ${tuples.join(",")}${conflict} RETURNING *`, params);
      } else if (this.action === "update") {
        const set = keys.map((key) => { params.push(serializeValue((this.payload as Row)[key])); return `${id(key)} = $${params.length}`; }).join(",");
        result = await client.query(`UPDATE ${id(this.table)} SET ${set}${where} RETURNING *`, params);
      } else {
        result = await client.query(`DELETE FROM ${id(this.table)}${where} RETURNING *`, this.values);
      }
      const data = single ? (result.rows[0] ?? null) : result.rows;
      return { data, error: null, count: result.rowCount ?? 0 };
    } catch (error) { return { data: null, error: error instanceof Error ? error : new Error(String(error)) }; }
    finally { client.release(); }
  }
}

export function createLocalPostgresClient() {
  return {
    from(table: string) { return new QueryBuilder(table); },
    // Mirrors PostgREST's `rpc()` unwrapping: a function returning a single scalar
    // (e.g. `next_applicant_candidate_number() RETURNS text`) comes back from Supabase
    // as that bare value, not `{ next_applicant_candidate_number: value }` — callers
    // like `approveOnlineRegistration` do `String(data)` expecting the scalar directly.
    async rpc(name: string, args: Row = {}) { const client = await getPool().connect(); try { const params = Object.values(args); const result = await client.query(`SELECT ${id(name)}(${Object.keys(args).map((key, i) => `$${i + 1}`).join(",")})`, params); const row = result.rows[0]; const keys = row ? Object.keys(row) : []; const data = row && keys.length === 1 ? row[keys[0]] : (row ?? null); return { data, error: null }; } catch (error) { return { data: null, error: error instanceof Error ? error : new Error(String(error)) }; } finally { client.release(); } },
    async testConnection() { const client = await getPool().connect(); try { await client.query("SELECT 1"); return true; } finally { client.release(); } },
  };
}

export async function closeLocalPostgresPool() { if (pool) { await pool.end(); pool = null; } }
