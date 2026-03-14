"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDotenv = parseDotenv;
exports.getPrivilegedUrl = getPrivilegedUrl;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/**
 * Parses a dotenv-style file into key-value pairs.
 * Handles CRLF/LF line endings, comments, and blank lines.
 */
function parseDotenv(content) {
    const vars = {};
    for (const rawLine of content.split('\n')) {
        const line = rawLine.replace(/\r$/, '').trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) {
            continue;
        }
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        if (key) {
            vars[key] = value;
        }
    }
    return vars;
}
/**
 * Builds a database URL that bypasses RLS (table owner or superuser).
 *
 * Reads credentials from (in priority order):
 *   1. PURGE_DATABASE_URL env var (explicit override for CI)
 *   2. .env file at the repo root (prefers DATABASE_URL_MIGRATIONS)
 *   3. DATABASE_URL_MIGRATIONS (CI sets this to the qs_migrate role)
 *   4. DATABASE_URL with user swapped to qs_migrate (table owner, bypasses RLS)
 */
function getPrivilegedUrl() {
    if (process.env.PURGE_DATABASE_URL?.trim()) {
        return process.env.PURGE_DATABASE_URL;
    }
    // Try the repo-root .env file (process.cwd() = apps/api/)
    const envPath = (0, node_path_1.resolve)(process.cwd(), '../../.env');
    try {
        const vars = parseDotenv((0, node_fs_1.readFileSync)(envPath, 'utf-8'));
        // Prefer an explicit migrations URL if present (supports non-localhost hosts).
        const migrationsUrlFromFile = vars.DATABASE_URL_MIGRATIONS;
        if (migrationsUrlFromFile?.trim()) {
            return migrationsUrlFromFile;
        }
        const runtimeUrlFromFile = vars.DATABASE_URL;
        // Prefer the migration user (table owner → bypasses RLS)
        const migrateUser = vars.QS_DB_MIGRATE_USER;
        const migratePassword = vars.QS_DB_MIGRATE_PASSWORD;
        if (runtimeUrlFromFile?.trim() && migrateUser && migratePassword) {
            const url = new URL(runtimeUrlFromFile);
            url.username = migrateUser;
            url.password = migratePassword;
            return url.toString();
        }
        if (runtimeUrlFromFile?.trim()) {
            return runtimeUrlFromFile;
        }
    }
    catch {
        // .env doesn't exist (CI) — fall through
    }
    // Try DATABASE_URL_MIGRATIONS (CI should set this to the qs_migrate role)
    const migrationsUrl = process.env.DATABASE_URL_MIGRATIONS;
    if (migrationsUrl?.trim()) {
        return migrationsUrl;
    }
    // Last resort: swap DATABASE_URL user to qs_migrate
    const runtimeUrl = process.env.DATABASE_URL;
    if (runtimeUrl?.trim()) {
        const migratePassword = process.env.QS_DB_MIGRATE_PASSWORD;
        if (migratePassword) {
            return runtimeUrl.replace(/\/\/[^@]+@/, `//qs_migrate:${migratePassword}@`);
        }
    }
    throw new Error('Cannot determine database connection for test cleanup. ' +
        'Set PURGE_DATABASE_URL or ensure .env exists at the repo root.');
}
