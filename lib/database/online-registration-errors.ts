/**
 * Error classes shared by both Online Register storage implementations
 * (sqlite-online-registrations.ts, google-sheets-online-registrations.ts).
 * Kept provider-agnostic so `instanceof` checks in lib/api-error.ts work
 * regardless of which one actually threw — importing these from either
 * storage file directly would pull that file's provider-specific
 * dependencies (e.g. node:sqlite) into the other provider's code path.
 */

export class RegistrationIncompleteError extends Error {
  constructor(missing: string[]) {
    super(`Fill in ${missing.join(", ")} before approving this registration.`);
    this.name = "RegistrationIncompleteError";
  }
}

export class RegistrationAlreadyDecidedError extends Error {
  constructor(status: string) {
    super(`This registration was already ${status.toLowerCase()}.`);
    this.name = "RegistrationAlreadyDecidedError";
  }
}

export class RegistrationAlreadySubmittedError extends Error {
  constructor() {
    super("This application has already been submitted and is awaiting review.");
    this.name = "RegistrationAlreadySubmittedError";
  }
}
