import { describe, expect, it } from "vitest";

import { buildDropSchemaSql, buildProvisionSql, validateSchemaSql } from "./schema-provisioner";

/**
 * Coverage for PR #13 (schema provisioner). The validator is a security
 * boundary: it must reject anything that would break the constitution's
 * RLS-everywhere invariant or escape the per-app schema.
 */

describe("validateSchemaSql", () => {
  it("accepts a minimal CREATE TABLE", () => {
    const res = validateSchemaSql(`create table todos (id uuid primary key, title text);`);
    expect(res.ok).toBe(true);
    expect(res.findings).toEqual([]);
  });

  const denied: Array<[string, string]> = [
    ["disable RLS", `alter table todos disable row level security;`],
    ["force-disable RLS", `alter table todos no force row level security;`],
    ["install extension", `create extension if not exists pgcrypto;`],
    ["drop database", `drop database neondb;`],
    ["create schema", `create schema sneaky;`],
    ["drop schema", `drop schema public cascade;`],
    ["grant", `grant all on todos to authenticated;`],
    ["revoke", `revoke select on todos from anon;`],
    ["set role", `set role postgres;`],
    ["set session authorization", `set session authorization postgres;`],
    ["create role", `create role hacker;`],
    ["alter user", `alter user hacker with superuser;`],
    [
      "security definer",
      `create function f() returns void language plpgsql security definer as $$ begin end $$;`,
    ],
    ["COPY PROGRAM", `copy todos to program 'cat > /tmp/x';`],
    ["psql meta-command", `\\copy todos from 'x.csv'`],
    ["cross-schema (auth)", `select * from auth.users;`],
    ["cross-schema (pg_catalog)", `select * from pg_catalog.pg_tables;`],
    ["cross-schema (public)", `select * from public.users;`],
  ];

  for (const [label, sql] of denied) {
    it(`rejects: ${label}`, () => {
      const res = validateSchemaSql(sql);
      expect(res.ok).toBe(false);
      expect(res.findings.length).toBeGreaterThan(0);
      expect(res.findings[0]!.excerpt.length).toBeGreaterThan(0);
    });
  }

  it("reports every distinct violation rather than short-circuiting", () => {
    const res = validateSchemaSql(`
      grant select on todos to anon;
      create extension pgcrypto;
    `);
    expect(res.ok).toBe(false);
    expect(res.findings.length).toBeGreaterThanOrEqual(2);
    const patterns = res.findings.map((f) => f.pattern);
    expect(patterns).toEqual(expect.arrayContaining(["GRANT statements", "installing extensions"]));
  });

  it("is case-insensitive", () => {
    const res = validateSchemaSql(`ALTER TABLE foo DISABLE ROW LEVEL SECURITY;`);
    expect(res.ok).toBe(false);
  });
});

describe("buildProvisionSql", () => {
  it("rejects unsafe schema names before generating SQL", () => {
    expect(() => buildProvisionSql("public", "")).toThrow(/unsafe schema name/);
    expect(() => buildProvisionSql("app-todo", "")).toThrow(/unsafe schema name/);
    expect(() => buildProvisionSql("app_todo;DROP", "")).toThrow(/unsafe schema name/);
  });

  it("accepts the canonical `app_<slug>` shape", () => {
    expect(() => buildProvisionSql("app_my_todos", "")).not.toThrow();
  });

  it("wraps execution in a transaction with idempotent schema recreation", () => {
    const sql = buildProvisionSql("app_x", "create table todos (id uuid primary key);");
    expect(sql).toMatch(/^begin;/);
    expect(sql).toMatch(/commit;\s*$/);
    expect(sql).toMatch(/drop schema if exists app_x cascade;/);
    expect(sql).toMatch(/create schema app_x;/);
    expect(sql).toMatch(/set local search_path = app_x, public;/);
  });

  it("embeds the user's DDL verbatim and ensures a trailing semicolon", () => {
    const userSql = `create table todos (id uuid primary key)`;
    const sql = buildProvisionSql("app_x", userSql);
    // Trailing semicolon is added when missing so the user's last statement
    // doesn't merge into the DO block that follows.
    expect(sql).toMatch(/create table todos \(id uuid primary key\);/);
  });

  it("does not double-semicolon when the user already added one", () => {
    const userSql = `create table todos (id uuid primary key);`;
    const sql = buildProvisionSql("app_x", userSql);
    expect(sql.includes("primary key);;")).toBe(false);
  });

  it("augments every user table with created_by, team_id, RLS and the two default policies", () => {
    const sql = buildProvisionSql("app_x", "create table todos (id uuid primary key);");
    expect(sql).toMatch(/add column if not exists created_by uuid default auth\.uid\(\)/);
    expect(sql).toMatch(
      /add column if not exists team_id uuid default \(\(auth\.jwt\(\) ->> ''team_id''\)::uuid\)/,
    );
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/buendia members read/);
    expect(sql).toMatch(/buendia editors write/);
    // Policies are keyed off the JWT's team_id + buendia_role claims.
    expect(sql).toMatch(/team_id = \(\(auth\.jwt\(\) ->> 'team_id'\)::uuid\)/);
    expect(sql).toMatch(/'owner','editor'/);
  });

  it("drops policies before recreating to make re-provisioning idempotent", () => {
    const sql = buildProvisionSql("app_x", "create table todos (id uuid primary key);");
    expect(sql).toMatch(/drop policy if exists "buendia members read"/);
    expect(sql).toMatch(/drop policy if exists "buendia editors write"/);
  });

  it("handles an empty user-supplied schema (still creates the schema)", () => {
    const sql = buildProvisionSql("app_x", "");
    expect(sql).toMatch(/create schema app_x;/);
    // No user body section means no straggling semicolons appear before the DO block.
    expect(sql).not.toMatch(/;\s*;/);
  });
});

describe("buildDropSchemaSql", () => {
  it("rejects unsafe schema names", () => {
    expect(() => buildDropSchemaSql("public")).toThrow(/unsafe/);
    expect(() => buildDropSchemaSql("app_x; drop database neondb")).toThrow(/unsafe/);
  });

  it("emits an idempotent cascade drop", () => {
    expect(buildDropSchemaSql("app_x")).toBe("drop schema if exists app_x cascade;");
  });
});
