// Real PostgreSQL execution in an ephemeral local PGlite database. No remote DB.
// Install once: npm install --prefix "$env:TEMP/michelline-sql-check" @electric-sql/pglite
// Run: node tools/test-event-tables.cjs
// Optional PGLITE_MODULE points at another local installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { PGlite } = require(process.env.PGLITE_MODULE || path.join(os.tmpdir(), 'michelline-sql-check/node_modules/@electric-sql/pglite'));
const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'docs/SUPABASE-EVENT-TABLES.sql'), 'utf8');
const hardening = fs.readFileSync(path.join(root, 'docs/SUPABASE-PLATFORM-HARDENING.sql'), 'utf8');
const organizer = fs.readFileSync(path.join(root, 'docs/SUPABASE-ORGANIZER-ACCESS.sql'), 'utf8');
function functionSql(source, name) {
    const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert(start >= 0, `Canonical function ${name} exists`);
    const end = source.indexOf('$$;', start);
    assert(end > start);
    return source.slice(start, end + 3);
}
const id = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const db = new PGlite();
let assertions = 0;
async function rows(sql, args = []) { return (await db.query(sql, args)).rows; }
async function one(sql, args = []) { return (await rows(sql, args))[0]; }
async function rejects(sql, args, code) {
    await assert.rejects(db.query(sql, args), (error) => error.code === code);
    assertions++;
}
async function as(role, user, action) {
    await db.exec(`SET ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user || '']);
    try { return await action(); } finally { await db.exec('RESET ROLE'); }
}
async function guests() { return rows('SELECT to_jsonb(g) AS data FROM public.guests g ORDER BY id'); }
function withoutTable(records) {
    return records.map(({ data }) => {
        const result = { ...data }; delete result.table_id; delete result.table_number; return result;
    });
}
(async () => {
    try {
        await assert.rejects(db.exec(migration), /Prerequis manquants/); assertions++;
        await db.exec('ROLLBACK');
        assert.equal((await one("SELECT to_regclass('public.event_tables') AS registry")).registry, null); assertions++;
        await db.exec(`
            CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
            CREATE ROLE service_role NOLOGIN BYPASSRLS;
            CREATE SCHEMA auth;
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
                $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
            GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
            CREATE TABLE public.events (
                id text PRIMARY KEY, slug text UNIQUE, owner_id uuid, is_published boolean DEFAULT true
            );
            CREATE TABLE public.event_collaborators(event_id text, user_id uuid);
            CREATE TABLE public.event_guest_managers(event_id text, user_id uuid);
            CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS
                $$ SELECT auth.uid() = '${id(4)}'::uuid $$;
            CREATE TABLE public.guests (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
                slug text NOT NULL, full_name text NOT NULL, phone text, email text, group_name text,
                token text NOT NULL UNIQUE, status text DEFAULT 'pending', adults int DEFAULT 1, children int DEFAULT 0,
                rsvp_message text, responded_at timestamptz, created_at timestamptz DEFAULT now(),
                access_code text, table_number text, drink_choices text, profile_photo_url text,
                qr_approved boolean NOT NULL DEFAULT false, checked_in_at timestamptz, UNIQUE(event_id,slug)
            );
            CREATE TABLE public.rsvps (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id text, guest_id uuid REFERENCES public.guests(id),
                full_name text, phone text, status text, adults int, children int, message text,
                created_at timestamptz DEFAULT now()
            );
            CREATE UNIQUE INDEX rsvps_one_response_per_guest ON public.rsvps(event_id,guest_id) WHERE guest_id IS NOT NULL;
            ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
            GRANT SELECT,INSERT,UPDATE,DELETE ON public.guests TO authenticated;
            INSERT INTO public.events(id,slug,owner_id) VALUES ('event-a','event-a','${id(1)}'),('event-b','event-b','${id(2)}');
            INSERT INTO public.event_collaborators VALUES ('event-a','${id(3)}');
            INSERT INTO public.event_guest_managers VALUES ('event-b','${id(6)}');
        `);
        await db.exec(functionSql(organizer, 'can_manage_guests'));
        await db.exec(`CREATE POLICY guests_manager_all ON public.guests FOR ALL TO authenticated
            USING(public.can_manage_guests(event_id)) WITH CHECK(public.can_manage_guests(event_id));
            REVOKE ALL ON FUNCTION public.can_manage_guests(text) FROM PUBLIC;
            GRANT EXECUTE ON FUNCTION public.can_manage_guests(text) TO authenticated;`);
        await db.exec(functionSql(hardening, 'get_guest_invite'));
        await db.exec(functionSql(hardening, 'submit_guest_rsvp'));
        await db.exec(functionSql(hardening, 'guest_name_identity'));
        await db.exec(functionSql(hardening, 'guest_display_name'));
        // Same targeted authorization update as ORGANIZER-ACCESS; execute the
        // canonical replacement body, including its real RSVP-preservation logic.
        await db.exec(functionSql(hardening, 'replace_managed_guests').replace(
            'NOT public.can_manage_event(target_event_id)', 'NOT public.can_manage_guests(target_event_id)'));
        await db.exec(`REVOKE ALL ON FUNCTION public.replace_managed_guests(text,jsonb) FROM PUBLIC, anon;
            GRANT EXECUTE ON FUNCTION public.replace_managed_guests(text,jsonb) TO authenticated;`);
        await db.exec(`GRANT EXECUTE ON FUNCTION public.get_guest_invite(text) TO anon;
            GRANT EXECUTE ON FUNCTION public.submit_guest_rsvp(text,text,text,text,integer,integer,text,jsonb,text) TO anon;`);
        const definitionsBefore = await rows(`SELECT proname, pg_get_functiondef(oid) AS definition FROM pg_proc
            WHERE oid IN ('public.get_guest_invite(text)'::regprocedure,
            'public.submit_guest_rsvp(text,text,text,text,integer,integer,text,jsonb,text)'::regprocedure) ORDER BY proname`);
        const importBefore = await one(`SELECT pg_get_functiondef(oid) AS definition, proacl::text AS acl, proowner
            FROM pg_proc WHERE oid='public.replace_managed_guests(text,jsonb)'::regprocedure`);
        const labels = ['Rose', 'rose', ' Rose ', '   ', null, '', 'Rose'];
        for (let i = 0; i < labels.length; i++) {
            await db.query(`INSERT INTO public.guests(id,event_id,slug,full_name,token,group_name,table_number,status,adults,children)
                VALUES ($1,'event-a',$2,$3,$4,'Famille',$5,$6,2,1)`,
            [id(100 + i), `guest-${i}`, `Invite ${i}`, `token-${i}`, labels[i], i === 1 ? 'yes' : i === 2 ? 'no' : 'pending']);
        }
        await db.query(`INSERT INTO public.guests(id,event_id,slug,full_name,token,table_number)
            VALUES ($1,'event-b','other','Autre invite','other-token','Rose')`, [id(200)]);
        const before = await guests();
        await db.exec(migration);
        const importAfter = await one(`SELECT pg_get_functiondef(oid) AS definition, proacl::text AS acl, proowner
            FROM pg_proc WHERE oid='public.replace_managed_guests(text,jsonb)'::regprocedure`);
        assert.deepEqual(importAfter, {
            ...importBefore,
            definition: importBefore.definition.replace('table_number = incoming_table',
                'table_id = public.resolve_legacy_guest_table_id(target_event_id, incoming_table),\n                    table_number = incoming_table')
        }); assertions++;
        const migrated = await guests();
        assert.deepEqual(migrated.map(({ data }) => { const copy = { ...data }; delete copy.table_id; return { data: copy }; }), before); assertions++;
        assert.equal((await one('SELECT count(*)::int AS total FROM event_tables')).total, 5); assertions++;
        assert.deepEqual((await rows("SELECT name FROM event_tables WHERE event_id='event-a' ORDER BY name")).map(r => r.name), ['   ', ' Rose ', 'Rose', 'rose']); assertions++;
        assert.equal(migrated[0].data.table_id, migrated[6].data.table_id); assertions++;
        assert.notEqual(migrated[0].data.table_id, migrated[7].data.table_id); assertions++;
        const tablesBeforeReplay = await rows('SELECT * FROM event_tables ORDER BY id');
        await db.exec(migration);
        assert.deepEqual(await one(`SELECT pg_get_functiondef(oid) AS definition, proacl::text AS acl, proowner
            FROM pg_proc WHERE oid='public.replace_managed_guests(text,jsonb)'::regprocedure`), importAfter); assertions++;
        assert.deepEqual(await guests(), migrated); assertions++;
        assert.deepEqual(await rows('SELECT * FROM event_tables ORDER BY id'), tablesBeforeReplay); assertions++;
        assert.deepEqual(await rows(`SELECT proname, pg_get_functiondef(oid) AS definition FROM pg_proc
            WHERE oid IN ('public.get_guest_invite(text)'::regprocedure,
            'public.submit_guest_rsvp(text,text,text,text,integer,integer,text,jsonb,text)'::regprocedure) ORDER BY proname`), definitionsBefore); assertions++;

        await as('anon', null, async () => {
            await rejects('SELECT * FROM event_tables', [], '42501');
            await rejects("SELECT resolve_legacy_guest_table_id('event-a','Interdit')", [], '42501');
            await rejects("SELECT create_managed_table('event-a','Interdit',NULL)", [], '42501');
            const invite = await one("SELECT * FROM get_guest_invite('token-0')");
            assert.equal(invite.id, id(100)); assert.equal(invite.table_number, 'Rose'); assert(invite.table_id); assertions += 3;
        });
        await as('authenticated', id(5), async () => {
            assert.equal((await rows('SELECT * FROM event_tables')).length, 0); assertions++;
            await rejects("SELECT create_managed_table('event-a','Interdit',NULL)", [], '42501');
        });
        await as('authenticated', null, async () => {
            await rejects("SELECT create_managed_table('event-a','Sans session',NULL)", [], '42501');
        });
        let table;
        await as('authenticated', id(1), async () => {
            assert.equal((await rows('SELECT * FROM event_tables')).length, 4); assertions++;
            await rejects("SELECT resolve_legacy_guest_table_id('event-a','Interdit')", [], '42501');
            await rejects("INSERT INTO event_tables(event_id,name) VALUES ('event-a','Direct')", [], '42501');
            await rejects("SELECT create_managed_table('event-b','Interdit',NULL)", [], '42501');
            await rejects("SELECT create_managed_table('event-a','',NULL)", [], '22023');
            await rejects("SELECT create_managed_table('event-a','   ',NULL)", [], '22023');
            await rejects("SELECT create_managed_table('event-a',$1,NULL)", ['A'.repeat(121)], '22023');
            await rejects("SELECT create_managed_table('event-a','Invalide',0)", [], '22023');
            table = await one("SELECT * FROM create_managed_table('event-a','Jasmin',1)");
            await rejects("SELECT create_managed_table('event-a','Jasmin',NULL)", [], '23505');
            const unchanged = await guests();
            await rejects("SELECT assign_managed_table('event-a',$1::uuid[],$2::uuid)", [[id(100), id(200)], table.id], '22023');
            await rejects("SELECT assign_managed_table('event-a',$1::uuid[],$2::uuid)", [[id(100), id(999)], table.id], '22023');
            assert.deepEqual(await guests(), unchanged); assertions++;
            await rejects("SELECT assign_managed_table('event-a',$1::uuid[],NULL)", [[null]], '22023');
            assert.equal((await one("SELECT assign_managed_table('event-a',$1::uuid[],$2::uuid) AS total", [[id(100), id(100), id(101), id(102)], table.id])).total, 3); assertions++;
            assert.equal((await one("SELECT assign_managed_table('event-a','{}'::uuid[],$1) AS total", [table.id])).total, 0); assertions++;
            await db.query("SELECT update_managed_table('event-a',$1,'Orchidee',1)", [table.id]);
            assert.deepEqual((await rows('SELECT table_number FROM guests WHERE table_id=$1', [table.id])).map(r => r.table_number), ['Orchidee', 'Orchidee', 'Orchidee']); assertions++;
            await rejects("SELECT update_managed_table('event-a',$1,'Rose',1)", [table.id], '23505');
            assert.equal((await one('SELECT name FROM event_tables WHERE id=$1', [table.id])).name, 'Orchidee'); assertions++;
            assert.deepEqual((await rows('SELECT table_number FROM guests WHERE table_id=$1', [table.id])).map(r => r.table_number), ['Orchidee', 'Orchidee', 'Orchidee']); assertions++;
            await db.query("UPDATE guests SET table_number='Jasmin' WHERE id=$1", [id(100)]);
            assert.equal((await one('SELECT table_number FROM guests WHERE id=$1', [id(100)])).table_number, 'Orchidee'); assertions++;
        });
        assert.deepEqual(withoutTable(await guests()), withoutTable(before)); assertions++;
        await rejects('DELETE FROM event_tables WHERE id=$1', [table.id], '23503');
        const foreignTable = await one("SELECT id FROM event_tables WHERE event_id='event-b'");
        await rejects('UPDATE guests SET table_id=$1 WHERE id=$2', [foreignTable.id, id(100)], '23503');
        await db.exec('ALTER TABLE guests DISABLE TRIGGER sync_guest_managed_table');
        try {
            // The composite FK protects event isolation independently of the trigger.
            await rejects('UPDATE guests SET table_id=$1 WHERE id=$2', [foreignTable.id, id(100)], '23503');
        } finally { await db.exec('ALTER TABLE guests ENABLE TRIGGER sync_guest_managed_table'); }
        await as('authenticated', id(1), async () => {
            await rejects("SELECT assign_managed_table('event-a',$1,$2)", [[id(100)], foreignTable.id], '22023');
            await rejects("SELECT update_managed_table('event-a',$1,'X',NULL)", [foreignTable.id], '22023');
            await rejects("SELECT delete_managed_table('event-a',$1)", [foreignTable.id], '22023');
            await db.query("SELECT assign_managed_table('event-a',$1,NULL)", [[id(101)]]);
            const cleared = await one('SELECT table_id,table_number FROM guests WHERE id=$1', [id(101)]);
            assert.deepEqual(cleared, { table_id: null, table_number: null }); assertions++;
        });
        for (const user of [id(3), id(4)]) {
            await as('authenticated', user, async () => { assert((await one("SELECT * FROM create_managed_table('event-a',$1,NULL)", [`Access ${user}`])).id); assertions++; });
        }
        await as('authenticated', id(6), async () => { assert((await one("SELECT * FROM create_managed_table('event-b','Organisateur',NULL)")).id); assertions++; });

        await as('authenticated', id(1), async () => {
            const imported = await one(`INSERT INTO guests(event_id,slug,full_name,token,table_number,group_name)
                VALUES ('event-a','import','Import','import-token',$1,'Groupe intact') RETURNING *`, ['Legacy '.repeat(30)]);
            assert(imported.table_id); assert.equal(imported.table_number, 'Legacy '.repeat(30)); assertions += 2;
            const resized = await one("SELECT * FROM update_managed_table('event-a',$1,$2,6)", [imported.table_id, imported.table_number]);
            assert.equal(resized.name, imported.table_number); assert.equal(resized.capacity, 6); assertions += 2;
            await rejects("SELECT update_managed_table('event-a',$1,$2,6)", [imported.table_id, 'Another '.repeat(30)], '22023');
            await db.query('UPDATE guests SET table_id=NULL WHERE id=$1', [imported.id]);
            assert.equal((await one('SELECT table_number FROM guests WHERE id=$1', [imported.id])).table_number, null); assertions++;
        });
        await as('anon', null, async () => {
            const response = await one("SELECT * FROM submit_guest_rsvp('event-a','token-0','','yes',4,3,'Present','[]'::jsonb,'')");
            assert.equal(response.status, 'yes'); assert.equal(response.adults, 4); assert.equal(response.children, 3);
            assert.equal(response.table_id, table.id); assert.equal(response.table_number, 'Orchidee'); assertions += 5;
        });
        const beforeDelete = await guests();
        await as('authenticated', id(1), async () => { await db.query("SELECT delete_managed_table('event-a',$1)", [table.id]); });
        assert.deepEqual(withoutTable(await guests()), withoutTable(beforeDelete)); assertions++;
        assert.equal((await one('SELECT count(*)::int AS total FROM guests WHERE table_id=$1', [table.id])).total, 0); assertions++;
        assert.equal((await one('SELECT count(*)::int AS total FROM event_tables WHERE id=$1', [table.id])).total, 0); assertions++;
        assert.equal((await one('SELECT count(*)::int AS total FROM rsvps')).total, 1); assertions++;
        await db.exec("DELETE FROM events WHERE id='event-b'");
        assert.equal((await one("SELECT count(*)::int AS total FROM event_tables WHERE event_id='event-b'")).total, 0); assertions++;

        // A canonical CSV replacement changes pending assignments deliberately,
        // preserves all confirmed/historical RSVP rows, and supports unassignment.
        await db.exec(`INSERT INTO events(id,slug,owner_id) VALUES ('event-c','event-c','${id(1)}');
            INSERT INTO event_guest_managers VALUES ('event-c','${id(7)}');
            INSERT INTO guests(id,event_id,slug,full_name,token,status,table_number,group_name)
            VALUES ('${id(300)}','event-c','pending-import','Pending Import','pending-import-token','pending','Avant','Famille'),
                ('${id(301)}','event-c','confirmed-import','Confirmed Import','confirmed-import-token','yes','Confirmee','Amis'),
                ('${id(302)}','event-c','history-import','Historic RSVP','history-import-token','pending','Historique','Proches'),
                ('${id(303)}','event-c','omitted-import','Omitted Pending','omitted-import-token','pending','Omission',NULL);
            INSERT INTO rsvps(event_id,guest_id,full_name,status,adults,children,message)
            VALUES ('event-c','${id(301)}','Confirmed Import','yes',2,1,'Reponse conservee'),
                ('event-c','${id(302)}','Historic RSVP','yes',2,0,'Historique conserve');`);
        const pendingBefore = await one('SELECT * FROM guests WHERE id=$1', [id(300)]);
        const confirmedBefore = await rows("SELECT * FROM guests WHERE id=ANY($1) ORDER BY id", [[id(301), id(302)]]);
        const rsvpsBefore = await rows("SELECT * FROM rsvps WHERE event_id='event-c' ORDER BY id");
        let importedRows = [
            { fullName: 'Pending Import', group: 'Famille', tableNumber: 'Apres CSV' },
            { fullName: 'Confirmed Import', tableNumber: 'Ne doit pas remplacer' },
            { fullName: 'Historic RSVP', tableNumber: 'Ne doit pas remplacer' },
            { fullName: 'New Import', tableNumber: 'Nouvelle CSV' }
        ];
        await as('authenticated', id(7), async () => {
            const result = await one("SELECT replace_managed_guests('event-c',$1::jsonb) AS report", [JSON.stringify(importedRows)]);
            assert.deepEqual(result.report, { created: 1, updated: 1, preserved: 2, renamedCouples: 0, removed: 1 }); assertions++;
        });
        const pendingAfter = await one('SELECT * FROM guests WHERE id=$1', [id(300)]);
        assert.equal(pendingAfter.table_number, 'Apres CSV'); assertions++;
        assert.notEqual(pendingAfter.table_id, pendingBefore.table_id); assertions++;
        assert.deepEqual(withoutTable([{ data: pendingAfter }]), withoutTable([{ data: pendingBefore }])); assertions++;
        assert.equal((await one('SELECT name FROM event_tables WHERE id=$1', [pendingAfter.table_id])).name, 'Apres CSV'); assertions++;
        assert.deepEqual(await rows("SELECT * FROM guests WHERE id=ANY($1) ORDER BY id", [[id(301), id(302)]]), confirmedBefore); assertions++;
        assert.deepEqual(await rows("SELECT * FROM rsvps WHERE event_id='event-c' ORDER BY id"), rsvpsBefore); assertions++;
        const newGuest = await one("SELECT * FROM guests WHERE event_id='event-c' AND full_name='New Import'");
        assert.equal(newGuest.table_number, 'Nouvelle CSV'); assert(newGuest.table_id); assertions += 2;
        importedRows[0] = { fullName: 'Pending Import', group: 'Famille', tableNumber: '' };
        await as('authenticated', id(7), async () => {
            await db.query("SELECT replace_managed_guests('event-c',$1::jsonb)", [JSON.stringify(importedRows)]);
        });
        assert.deepEqual(await one('SELECT table_id,table_number FROM guests WHERE id=$1', [id(300)]), { table_id: null, table_number: null }); assertions++;
        await db.exec(migration);
        importedRows[0] = { fullName: 'Pending Import', group: 'Famille', table_number: 'Derniere CSV' };
        await as('authenticated', id(7), async () => {
            await db.query("SELECT replace_managed_guests('event-c',$1::jsonb)", [JSON.stringify(importedRows)]);
            const assigned = await one('SELECT table_id,table_number FROM guests WHERE id=$1', [id(300)]);
            assert.equal(assigned.table_number, 'Derniere CSV'); assert(assigned.table_id); assertions += 2;
            await db.query("UPDATE guests SET table_number='Ancienne fiche' WHERE id=$1", [id(300)]);
            assert.deepEqual(await one('SELECT table_id,table_number FROM guests WHERE id=$1', [id(300)]), assigned); assertions++;
        });
        assert.deepEqual(await rows("SELECT * FROM guests WHERE id=ANY($1) ORDER BY id", [[id(301), id(302)]]), confirmedBefore); assertions++;
        assert.deepEqual(await rows("SELECT * FROM rsvps WHERE event_id='event-c' ORDER BY id"), rsvpsBefore); assertions++;
        await as('authenticated', id(5), async () => {
            await rejects("SELECT replace_managed_guests('event-c',$1::jsonb)", [JSON.stringify(importedRows)], 'P0001');
        });
        await as('anon', null, async () => {
            await rejects("SELECT replace_managed_guests('event-c',$1::jsonb)", [JSON.stringify(importedRows)], '42501');
        });
        console.log(`PASS: ${assertions} assertions; repeat migration, exact backfill, RLS/auth, atomic assignments, snapshot sync, canonical CSV replacement, delete and anonymous RSVP in real local PostgreSQL.`);
    } finally { await db.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
