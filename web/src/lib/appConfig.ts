/**
 * App display name from `NEXT_PUBLIC_APP_NAME` (.env).
 * NEXT_PUBLIC_* values are inlined at build time, so rebuild after changing it.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Mi Robot Simulator";
