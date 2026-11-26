/**
 * Backward-compatibility shim.
 *
 * The application data layer was migrated from Google Sheets to Supabase
 * (PostgreSQL). This module re-exports the new Supabase-backed implementation
 * from `./db` so existing imports (`@/lib/google-sheets`) continue to work
 * without touching every API route and page.
 *
 * Do not add new Google Sheets logic here — write it in `./db`.
 */
export * from './db';
