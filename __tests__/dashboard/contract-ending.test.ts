import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { getNearestContractEndDates } from "@/lib/database/sqlite-adapter";

function makeDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE employees (
      record_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE contract_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      contract_end TEXT NOT NULL DEFAULT ''
    );
  `);
  return db;
}

describe("dashboard contract ending dates", () => {
  it("uses a contract ending this month", () => {
    const db = makeDb();
    db.exec("INSERT INTO contract_history (employee_id, contract_end) VALUES ('normal', '2026-08-28')");

    expect(getNearestContractEndDates(db, "2026-08-21")).toEqual({ normal: "2026-08-28" });
  });

  it("chooses the nearest of multiple future contracts", () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO contract_history (employee_id, contract_end) VALUES
        ('renewed', '2026-11-30'), ('renewed', '2030-11-30');
    `);

    expect(getNearestContractEndDates(db, "2026-08-21").renewed).toBe("2026-11-30");
  });

  it("ignores expired history when a newer contract remains", () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO contract_history (employee_id, contract_end) VALUES
        ('historical', '2020-12-31'), ('historical', '2027-01-31');
    `);

    expect(getNearestContractEndDates(db, "2026-08-21").historical).toBe("2027-01-31");
  });

  it("does not return an employee with no contract history", () => {
    const db = makeDb();
    db.exec("INSERT INTO employees (record_id, status) VALUES ('no-contract', 'Active')");

    expect(getNearestContractEndDates(db, "2026-08-21")).toEqual({});
  });

  it("still returns dates for inactive employees for the existing dashboard filter to exclude", () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO employees (record_id, status) VALUES ('inactive', 'Inactive');
      INSERT INTO contract_history (employee_id, contract_end) VALUES ('inactive', '2026-08-28');
    `);

    expect(getNearestContractEndDates(db, "2026-08-21").inactive).toBe("2026-08-28");
  });
});
