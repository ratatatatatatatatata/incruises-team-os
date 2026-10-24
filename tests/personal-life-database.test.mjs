import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("private workspace RLS, active membership, immutable versions, conflict detection and atomic snapshots", async () => {
  const db = new PGlite();
  const one = "00000000-0000-4000-8000-000000000001";
  const two = "00000000-0000-4000-8000-000000000002";
  const three = "00000000-0000-4000-8000-000000000003";
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create table public.team_members(user_id uuid primary key, status text);
      grant select on public.team_members to authenticated;
      insert into auth.users values ('${one}'),('${two}'),('${three}');
      insert into public.team_members values ('${one}','active'),('${two}','active'),('${three}','disabled');`);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261024144359_personal_life_workspace.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    async function asUser(user) {
      await db.exec(
        `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`,
      );
    }
    await asUser(one);
    await db.query(
      "insert into public.personal_life_workspaces(user_id,revision,state) values ($1,1,$2)",
      [one, { version: 1, private: "owner one" }],
    );
    assert.equal(
      (await db.query("select * from public.personal_life_versions")).rows
        .length,
      1,
    );
    await db.exec(
      `update public.personal_life_workspaces set revision=2,state='{"version":1,"changed":true}' where revision=1;`,
    );
    assert.equal(
      (await db.query("select * from public.personal_life_versions")).rows
        .length,
      2,
    );
    const conflict = await db.query(
      "update public.personal_life_workspaces set revision=2 where revision=1 returning revision",
    );
    assert.equal(conflict.rows.length, 0);
    await assert.rejects(
      db.exec(`update public.personal_life_workspaces set revision=7;`),
      /Revision conflict/,
    );
    await assert.rejects(
      db.exec(
        `update public.personal_life_workspaces set user_id='${two}',revision=3;`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into public.personal_life_versions values ('${one}',99,'{}',now());`,
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.exec(`delete from public.personal_life_versions;`),
      /permission denied/,
    );
    await assert.rejects(
      db.exec(`update public.personal_life_versions set state='{}';`),
      /permission denied/,
    );
    await assert.rejects(
      db.exec(`delete from public.personal_life_workspaces;`),
      /permission denied/,
    );
    await asUser(two);
    assert.equal(
      (await db.query("select * from public.personal_life_workspaces")).rows
        .length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.personal_life_versions")).rows
        .length,
      0,
    );
    assert.equal(
      (
        await db.query(
          `update public.personal_life_workspaces set revision=3 returning *`,
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.exec(
        `insert into public.personal_life_workspaces values ('${one}',1,'{"version":1}',now());`,
      ),
    );
    await asUser(three);
    await assert.rejects(
      db.exec(
        `insert into public.personal_life_workspaces values ('${three}',1,'{"version":1}',now());`,
      ),
      /row-level security/,
    );
    await db.exec("reset role; set role anon;");
    await assert.rejects(
      db.exec("select * from public.personal_life_workspaces;"),
      /permission denied/,
    );
    await db.exec(
      `reset role; update public.team_members set status='disabled' where user_id='${one}';`,
    );
    await asUser(one);
    assert.equal(
      (await db.query("select * from public.personal_life_workspaces")).rows
        .length,
      0,
    );
    await db.exec("reset role;");
    const snapshots = (
      await db.query(
        "select revision from public.personal_life_versions order by revision",
      )
    ).rows;
    assert.deepEqual(
      snapshots.map((r) => r.revision),
      [1, 2],
    );
    assert.equal(
      (await db.query("select revision from public.personal_life_workspaces"))
        .rows[0].revision,
      2,
    );
  } finally {
    await db.close();
  }
});
