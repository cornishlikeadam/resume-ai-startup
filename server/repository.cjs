const crypto = require("node:crypto");
const TABLES = new Set([
  "accounts",
  "sessions",
  "resumes",
  "applications",
  "leads",
]);

function createRepository(env) {
  let sql;
  let sdk;
  function table(name) {
    if (!TABLES.has(name)) throw new Error("Invalid collection");
    return `startup_${name}`;
  }
  if (env.DATABASE_URL) {
    sql = require("postgres")(env.DATABASE_URL, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 8,
    });
  } else if (env.INSFORGE_ENDPOINT && env.INSFORGE_SECRET_KEY) {
    sdk = require("@insforge/sdk").createClient({
      baseUrl: env.INSFORGE_ENDPOINT,
      anonKey: env.INSFORGE_SECRET_KEY,
    });
  }
  function ready() {
    if (!sql && !sdk)
      throw Object.assign(new Error("Persistent storage is not configured."), {
        status: 503,
      });
  }
  return {
    configured: Boolean(sql || sdk),
    async health() {
      ready();
      if (sql) await sql`select id from startup_accounts limit 0`;
      else {
        const { error } = await sdk.database
          .from("startup_accounts")
          .select("id")
          .limit(0);
        if (error)
          throw new Error(
            "Database is unavailable or schema has not been installed.",
          );
      }
      return true;
    },
    async list(name, filters = {}) {
      ready();
      const nameSql = table(name);
      if (sql) {
        const rows =
          await sql`select id, payload from ${sql(nameSql)} where payload @> ${sql.json(filters)} order by created_at desc limit 500`;
        return rows.map((row) => ({ ...row.payload, id: row.id }));
      }
      let query = sdk.database
        .from(nameSql)
        .select("id,payload")
        .order("created_at", { ascending: false })
        .limit(500);
      for (const [key, value] of Object.entries(filters))
        query = query.eq(`payload->>${key}`, String(value));
      const { data, error } = await query;
      if (error) throw new Error("Database query failed.");
      return (data || []).map((row) => ({ ...row.payload, id: row.id }));
    },
    async get(name, id) {
      ready();
      const nameSql = table(name);
      if (sql) {
        const rows =
          await sql`select id, payload from ${sql(nameSql)} where id = ${id} limit 1`;
        return rows[0] ? { ...rows[0].payload, id: rows[0].id } : null;
      }
      const { data, error } = await sdk.database
        .from(nameSql)
        .select("id,payload")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("Database query failed.");
      return data ? { ...data.payload, id: data.id } : null;
    },
    async put(name, payload, id = crypto.randomUUID()) {
      ready();
      const nameSql = table(name);
      if (sql) {
        await sql`insert into ${sql(nameSql)} (id, payload) values (${id}, ${sql.json(payload)}) on conflict (id) do update set payload = excluded.payload`;
      } else {
        const { error } = await sdk.database
          .from(nameSql)
          .upsert([{ id, payload }], { onConflict: "id" });
        if (error) {
          if (error.code === "23505")
            throw Object.assign(new Error("This record already exists."), {
              status: 409,
            });
          throw new Error("Database write failed.");
        }
      }
      return { ...payload, id };
    },
    async remove(name, id) {
      ready();
      const nameSql = table(name);
      if (sql) await sql`delete from ${sql(nameSql)} where id = ${id}`;
      else {
        const { error } = await sdk.database
          .from(nameSql)
          .delete()
          .eq("id", id);
        if (error) throw new Error("Database delete failed.");
      }
    },
    async close() {
      if (sql) await sql.end();
    },
  };
}

module.exports = { createRepository };
