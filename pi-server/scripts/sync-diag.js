// Read-only v2: extract the PHONE's local updatedAt from its pushed payload and
// compare against server truth + server clock. Run: node /tmp/gullak-diag.js
const D = require("better-sqlite3");
const db = new D(process.env.GULLAK_DB_PATH || "/data/gullak.db", { readonly: true });

const now = Date.now();
console.log("server clock now:", now, new Date(now).toISOString());

console.log("\n=== Dyson txn — current SERVER row ===");
const dyson = db
  .prepare(
    "select id, payee_name, category_id, notes, updated_at from transactions where payee_name like '%Dyson%' order by updated_at desc limit 2",
  )
  .all();
for (const t of dyson) {
  console.log(JSON.stringify(t));
  console.log(
    "  updated_at =",
    new Date(t.updated_at).toISOString(),
    "| vs now:",
    ((t.updated_at - now) / 1000).toFixed(0),
    "s",
  );
}

console.log("\n=== last 6 change_log rows for those txns (who wrote what, when) ===");
for (const t of dyson) {
  const rows = db
    .prepare(
      "select id, op, client_id, payload from change_log where resource='transactions' and resource_id=? order by id desc limit 6",
    )
    .all(t.id);
  for (const r of rows) {
    let pu = null,
      pc = null,
      pn = null;
    try {
      const p = JSON.parse(r.payload);
      pu = p.updatedAt;
      pc = p.categoryId;
      pn = p.notes;
    } catch {}
    console.log(
      `  #${r.id} op=${r.op} client=${r.client_id ?? "SERVER"} payload.updatedAt=${pu}` +
        (pu ? ` (${new Date(pu).toISOString()}, ${(((pu ?? 0) - now) / 1000).toFixed(0)}s vs now)` : "") +
        ` cat=${pc} notes=${JSON.stringify(pn)}`,
    );
  }
}

console.log("\n=== change_log head ===");
console.log(JSON.stringify(db.prepare("select max(id) as head from change_log").get()));
