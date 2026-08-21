/**
 * Provider-agnostic error classes. Both the SQLite adapter and the Google
 * Sheets adapter throw (or extend) these, so callers (API routes, pages)
 * can catch connection/config problems without knowing — or importing
 * anything from — the active provider.
 */

export class DatabaseNotConfiguredError extends Error {
  constructor(message = "Database connection is not configured.") {
    super(message);
    this.name = "DatabaseNotConfiguredError";
  }
}

export class DatabaseConnectionError extends Error {
  constructor(message = "Unable to connect to Employee Database.") {
    super(message);
    this.name = "DatabaseConnectionError";
  }
}

export class RecordNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} with ID "${id}" was not found.`);
    this.name = "RecordNotFoundError";
  }
}
