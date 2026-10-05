const fs = require("node:fs");
const path = require("node:path");
const postgres = require("postgres");
if (!process.env.DATABASE_URL)
  throw new Error(
    "Configure DATABASE_URL before running the additive schema migration.",
  );
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
(async () => {
  try {
    await sql.begin(async (transaction) =>
      transaction.unsafe(
        fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"),
      ),
    );
    console.log(
      "Startup schema installed. Existing application tables were not changed.",
    );
  } finally {
    await sql.end();
  }
})();
