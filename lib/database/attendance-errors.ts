/** Dipisah dari attendance-adapter.ts supaya sqlite-attendance.ts / postgres-attendance.ts bisa mengimpornya tanpa circular import (attendance-adapter.ts mengimpor kedua adapter itu). */
export class AttendanceProviderNotSupportedError extends Error {}
export class AttendanceValidationError extends Error {}
