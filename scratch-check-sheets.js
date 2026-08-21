(async () => {
  const { Client } = await import("pg");
  const path = await import("node:path");
  const { config } = await import("dotenv");
  config({ path: path.resolve(process.cwd(), ".env.local") });
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();

  const { rows } = await client.query(`
    SELECT e.nik, e.contract_status, e.contract_criteria, ch.contract_type, ch.contract_start, ch.contract_end
    FROM employees e
    JOIN contract_history ch ON ch.employee_id = e.record_id::text
    WHERE e.contract_status = 'Permanent'
    ORDER BY e.nik
    LIMIT 15
  `);
  console.log(rows);

  const { rows: distinctTypes } = await client.query(`
    SELECT contract_type, COUNT(*) FROM contract_history GROUP BY contract_type ORDER BY 2 DESC LIMIT 20
  `);
  console.log("distinct contract_type values:", distinctTypes);

  const { rows: statusCounts } = await client.query(`
    SELECT status, COUNT(*) FROM employees GROUP BY status
  `);
  console.log("employees.status distinct values:", statusCounts);

  await client.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
