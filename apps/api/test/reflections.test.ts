import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GAD7_ITEMS, QUESTIONS, REFLECTION_QUESTIONS, reflectionResponse, pageOf } from '@anxiocare/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openJson } from '../src/crypto.ts';
import { assertQuestionCatalogue, CatalogueError } from '../src/questions.ts';
import { dekFor, type UserRow } from '../src/users.ts';
import { API, assessmentPayload, baseEnv, Client, createHarness, reflectionPayload, signIn, signInConsented, type Harness } from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const denied = async (run: () => Promise<unknown>) => {
  await expect(run()).rejects.toMatchObject({ code: '42501' });
};

const post = (client: Client, body: unknown) => client.post(`${API}/reflections`, body);

interface QuestionRow {
  id: string;
  type: string;
  theme: string | null;
  position: number | null;
  text: string;
  answer_set: string;
  brings_help: boolean;
  active: boolean;
}

describe('the question catalogue in the database', () => {
  it('migration 005 seeds exactly the shared catalogue, GAD-7 and reflections alike', async () => {
    const rows = await h.admin<QuestionRow[]>`SELECT id, type, theme, position, text, answer_set, brings_help, active FROM app.questions ORDER BY id`;
    const expected = QUESTIONS.map((q) => ({
      id: q.id, type: q.type, theme: q.theme, position: q.position, text: q.text, answer_set: q.answerSet, brings_help: q.bringsHelp, active: q.active,
    })).sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(rows.map((r) => ({ ...r }))).toEqual(expected);
    expect(rows.filter((r) => r.type === 'reflection')).toHaveLength(100);
  });

  it('GAD-7 answers are stored as before: 7 numbers, position i being GAD7-(i+1), with no ids or text', async () => {
    const { client, id } = await signInConsented(h);
    const saved = (await client.post(`${API}/assessments`, assessmentPayload({ answers: [3, 2, 1, 0, 1, 2, 3] }))).json();
    const [user] = await h.admin<UserRow[]>`SELECT * FROM app.users WHERE id = ${id}::uuid`;
    const [row] = await h.admin<{ payload_ct: Buffer }[]>`SELECT payload_ct FROM app.assessments WHERE id = ${saved.id}::uuid`;
    const payload = openJson<Record<string, unknown>>(dekFor(h.config.keys, user!), row!.payload_ct, 'assessments.payload', saved.id, id);
    expect(Object.keys(payload).sort()).toEqual(['answers', 'difficulty', 'score', 'severity']);
    expect(payload.answers).toEqual([3, 2, 1, 0, 1, 2, 3]);
    expect(JSON.stringify(payload)).not.toMatch(/GAD7-|Feeling|Worrying/);
    const gad7 = await h.admin<{ id: string; position: number; text: string }[]>`SELECT id, position, text FROM app.questions WHERE type = 'gad7' ORDER BY position`;
    expect(gad7.map((q) => [q.id, q.position, q.text])).toEqual(GAD7_ITEMS.map((text, i) => [`GAD7-${i + 1}`, i + 1, text]));
  });

  it('refuses to change wording, type, theme, position, answer set or id, and refuses deletion, even for the owner', async () => {
    for (const statement of [
      "UPDATE app.questions SET text = 'Reworded' WHERE id = 'REF-001'",
      "UPDATE app.questions SET type = 'gad7' WHERE id = 'REF-001'",
      "UPDATE app.questions SET answer_set = 'gad7_frequency' WHERE id = 'REF-001'",
      "UPDATE app.questions SET id = 'REF-901' WHERE id = 'REF-001'",
      "UPDATE app.questions SET text = text || ' ' WHERE id = 'GAD7-1'",
      "DELETE FROM app.questions WHERE id = 'REF-001'",
      'TRUNCATE app.questions CASCADE',
      // A theme decides how an answer reads, and a position which GAD-7 item an answer is: both are frozen too.
      "UPDATE app.questions SET theme = 'coping' WHERE id = 'REF-001'",
      "UPDATE app.questions SET position = 2 WHERE id = 'GAD7-1'",
    ]) {
      await expect(h.admin.unsafe(statement), statement).rejects.toThrow(/never/);
    }
    const [row] = await h.admin<QuestionRow[]>`SELECT * FROM app.questions WHERE id = 'REF-001'`;
    expect(row!.text).toBe(REFLECTION_QUESTIONS[0]!.text);
  });

  it('can retire a question with active = false, and bring it back', async () => {
    await h.admin`UPDATE app.questions SET active = false WHERE id = 'REF-100'`;
    await h.admin`UPDATE app.questions SET active = true WHERE id = 'REF-100'`;
    const [row] = await h.admin<QuestionRow[]>`SELECT active FROM app.questions WHERE id = 'REF-100'`;
    expect(row!.active).toBe(true);
  });

  it('the runtime role can read it and nothing more', async () => {
    const [count] = await h.runtime<{ n: number }[]>`SELECT count(*)::int AS n FROM app.questions`;
    expect(count!.n).toBe(107);
    for (const statement of [
      "INSERT INTO app.questions (id, type, theme, text, answer_set) VALUES ('REF-999', 'reflection', 'worry', 'x', 'reflection_amount')",
      "UPDATE app.questions SET active = false WHERE id = 'REF-001'",
      "DELETE FROM app.questions WHERE id = 'REF-001'",
      'TRUNCATE app.questions',
      'ALTER TABLE app.questions ADD COLUMN x int',
    ]) {
      await denied(() => h.runtime.unsafe(statement));
    }
    const grants = await h.admin<{ privilege_type: string; table_name: string }[]>`
      SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE grantee = 'anxiocare_runtime' AND table_schema = 'app' AND table_name IN ('questions', 'reflections') ORDER BY 1, 2
    `;
    expect(grants.map((g) => `${g.table_name}.${g.privilege_type}`)).toEqual(['questions.SELECT', 'reflections.DELETE', 'reflections.INSERT', 'reflections.SELECT']);
  });

  it('both tables have RLS on, with policies only for the runtime role', async () => {
    const tables = await h.admin`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'app' AND tablename IN ('questions', 'reflections') ORDER BY 1`;
    expect(tables.map((t) => [t.tablename, t.rowsecurity])).toEqual([['questions', true], ['reflections', true]]);
    const policies = await h.admin`SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname = 'app' AND tablename IN ('questions', 'reflections') ORDER BY 1`;
    expect(policies.map((p) => [p.tablename, p.policyname, p.cmd, String(p.roles)])).toEqual([
      ['questions', 'runtime_read', 'SELECT', 'anxiocare_runtime'],
      ['reflections', 'runtime_all', 'ALL', 'anxiocare_runtime'],
    ]);
  });

  it('the boot check passes on the seeded table, and refuses a table that differs from the shared file', async () => {
    await expect(assertQuestionCatalogue(h.runtime)).resolves.toBeUndefined();
    await h.admin`INSERT INTO app.questions (id, type, theme, text, answer_set) VALUES ('REF-999', 'reflection', 'worry', 'An extra question today?', 'reflection_amount')`;
    try {
      const err = await assertQuestionCatalogue(h.runtime).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CatalogueError);
      expect(String((err as Error).message)).toMatch(/REF-999/);
    } finally {
      await h.admin`ALTER TABLE app.questions DISABLE TRIGGER USER`;
      await h.admin`DELETE FROM app.questions WHERE id = 'REF-999'`;
      await h.admin`ALTER TABLE app.questions ENABLE TRIGGER USER`;
    }
    await h.admin`UPDATE app.questions SET brings_help = NOT brings_help WHERE id = 'REF-002'`;
    try {
      await expect(assertQuestionCatalogue(h.runtime)).rejects.toThrow(/REF-002/);
    } finally {
      await h.admin`UPDATE app.questions SET brings_help = NOT brings_help WHERE id = 'REF-002'`;
    }
    await expect(assertQuestionCatalogue(h.runtime)).resolves.toBeUndefined();
  });
});

describe('the server at boot', () => {
  it('refuses to start when the live catalogue differs from the shared file, naming only the id', async () => {
    await h.admin`UPDATE app.questions SET brings_help = NOT brings_help WHERE id = 'REF-003'`;
    try {
      const server = spawn(process.execPath, [fileURLToPath(new URL('../src/server.ts', import.meta.url))], {
        env: { PATH: process.env.PATH, ...baseEnv({ DATABASE_URL: h.dbUrl('runtime'), PORT: String(40_000 + (process.pid % 10_000)), HOST: '127.0.0.1' }) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      server.stdout.on('data', (chunk) => (output += String(chunk)));
      server.stderr.on('data', (chunk) => (output += String(chunk)));
      const code = await new Promise<number | null>((resolve) => server.on('exit', resolve));
      expect(code, output).toBe(1);
      expect(output).toMatch(/does not match the shared catalogue: REF-003/);
      expect(output).not.toContain(REFLECTION_QUESTIONS[2]!.text);
    } finally {
      await h.admin`UPDATE app.questions SET brings_help = NOT brings_help WHERE id = 'REF-003'`;
    }
  });
});

describe('reflections', () => {
  it('saves one, replays it by clientRequestId, lists it newest first, and deletes it', async () => {
    const { client } = await signInConsented(h);
    const body = reflectionPayload({ note: '  SECRET-REFLECTION-NOTE  ' });
    const first = await post(client, body);
    expect(first.statusCode).toBe(201);
    const saved = reflectionResponse.strict().parse(first.json());
    expect(saved.answers).toEqual(body.answers);
    expect(saved.note).toBe('SECRET-REFLECTION-NOTE');

    const replay = await post(client, body);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());

    const second = (await post(client, reflectionPayload())).json();
    expect(second.note).toBeUndefined();
    const list = await client.get(`${API}/reflections`);
    expect(list.statusCode).toBe(200);
    const page = pageOf(reflectionResponse).parse(list.json());
    expect(page.items.map((r) => r.id)).toEqual([second.id, saved.id]);
    expect(page.nextCursor).toBeNull();

    expect((await client.delete(`${API}/reflections/${saved.id}`)).statusCode).toBe(204);
    expect((await client.delete(`${API}/reflections/${saved.id}`)).statusCode).toBe(404);
    expect((await client.get(`${API}/reflections`)).json().items.map((r: { id: string }) => r.id)).toEqual([second.id]);
    expect((await client.delete(`${API}/reflections/not-a-uuid`)).statusCode).toBe(404);
  });

  it('pages with a cursor, in the same shape as assessments', async () => {
    const { client } = await signInConsented(h);
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const takenAt = new Date(Date.now() - (3 - i) * 60_000).toISOString();
      ids.push((await post(client, reflectionPayload({ takenAt }))).json().id);
    }
    const one = (await client.get(`${API}/reflections?limit=2`)).json();
    expect(one.items.map((r: { id: string }) => r.id)).toEqual([ids[2], ids[1]]);
    expect(one.nextCursor).toEqual(expect.any(String));
    const two = (await client.get(`${API}/reflections?limit=2&cursor=${one.nextCursor}`)).json();
    expect(two.items.map((r: { id: string }) => r.id)).toEqual([ids[0]]);
    expect(two.nextCursor).toBeNull();
    expect((await client.get(`${API}/reflections?cursor=bad`)).statusCode).toBe(400);
  });

  it('accepts a reflection made before sign-in, up to a day old, never in the future', async () => {
    const { client } = await signInConsented(h);
    const takenAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const r = await post(client, reflectionPayload({ takenAt }));
    expect(r.statusCode).toBe(201);
    expect(r.json().takenAt).toBe(takenAt);
    expect((await post(client, reflectionPayload({ takenAt: new Date(Date.now() - 25 * 3_600_000).toISOString() }))).statusCode).toBe(400);
    expect((await post(client, reflectionPayload({ takenAt: new Date(Date.now() + 10 * 60_000).toISOString() }))).statusCode).toBe(400);
  });

  it('refuses unknown, inactive and GAD-7 ids, wrong counts, repeats and out-of-range answers, echoing nothing', async () => {
    const { client } = await signInConsented(h);
    const base = reflectionPayload();
    const swap = (q: string) => ({ ...base, clientRequestId: randomUUID(), answers: [{ q, a: 1 }, ...base.answers.slice(1)] });
    await h.admin`UPDATE app.questions SET active = false WHERE id = 'REF-099'`;
    try {
      for (const body of [
        swap('REF-999'),
        swap('REF-000'),
        swap('REF-099'),
        swap('GAD7-1'),
        swap('SECRETIDREF'),
        { ...base, answers: base.answers.slice(0, 4) },
        { ...base, answers: [...base.answers, { q: 'REF-090', a: 1 }] },
        { ...base, answers: [base.answers[0]!, ...base.answers.slice(0, 4)] },
        { ...base, answers: base.answers.map((x, i) => (i === 0 ? { ...x, a: 4 } : x)) },
        { ...base, answers: base.answers.map((x, i) => (i === 0 ? { ...x, a: -1 } : x)) },
        { ...base, answers: base.answers.map((x, i) => (i === 0 ? { ...x, a: 2.5 } : x)) },
        { ...base, answers: base.answers.map((x, i) => (i === 0 ? { ...x, text: 'SECRETTEXT' } : x)) },
        { ...base, note: 'x'.repeat(281) },
        { ...base, score: 3 },
        { answers: base.answers },
      ]) {
        const r = await post(client, body);
        expect([JSON.stringify(body).slice(0, 80), r.statusCode, r.json().code]).toEqual([JSON.stringify(body).slice(0, 80), 400, 'validation_failed']);
        expect(r.body).not.toMatch(/SECRET|REF-999|REF-099|GAD7-1/);
      }
    } finally {
      await h.admin`UPDATE app.questions SET active = true WHERE id = 'REF-099'`;
    }
    expect((await client.get(`${API}/reflections`)).json().items).toEqual([]);
  });

  it('a question retired after it was answered still reads back', async () => {
    const { client } = await signInConsented(h);
    const saved = (await post(client, reflectionPayload())).json();
    await h.admin`UPDATE app.questions SET active = false WHERE id = ${saved.answers[0].q}`;
    try {
      expect((await client.get(`${API}/reflections`)).json().items[0].answers).toEqual(saved.answers);
    } finally {
      await h.admin`UPDATE app.questions SET active = true WHERE id = ${saved.answers[0].q}`;
    }
  });
});

describe('reflections: access', () => {
  const routes = (id = randomUUID()) => [['GET', '/reflections'], ['GET', `/reflections/${id}`], ['POST', '/reflections', reflectionPayload()], ['DELETE', `/reflections/${id}`]] as [string, string, unknown?][];

  it('GET /reflections/:id returns your own one, and 404 for anyone else\'s, a malformed id or none', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    const mine = (await post(a.client, reflectionPayload({ note: 'A-ONLY' }))).json();
    const own = await a.client.get(`${API}/reflections/${mine.id}`);
    expect(own.statusCode).toBe(200);
    expect(reflectionResponse.strict().parse(own.json())).toEqual(mine);
    for (const [client, id] of [[b.client, mine.id], [a.client, randomUUID()], [a.client, 'not-a-uuid']] as const) {
      const r = await client.get(`${API}/reflections/${id}`);
      expect([id, r.statusCode, r.json().code]).toEqual([id, 404, 'not_found']);
      expect(r.body).not.toContain('A-ONLY');
    }
  });

  it('needs a session: 401 on all four', async () => {
    const client = new Client(h);
    for (const [method, path, body] of routes()) {
      const r = await client.request({ method: method as 'GET', url: `${API}${path}`, ...(body ? { payload: body as object } : {}) });
      expect([path, r.statusCode]).toEqual([path, 401]);
    }
  });

  it('needs current consent: 403 consent_required on all four', async () => {
    const { client } = await signIn(h);
    for (const [method, path, body] of routes()) {
      const r = await client.request({ method: method as 'GET', url: `${API}${path}`, ...(body ? { payload: body as object } : {}) });
      expect([path, r.statusCode, r.json().code]).toEqual([path, 403, 'consent_required']);
    }
  });

  it("keeps people apart: nobody lists or deletes another person's, and the same clientRequestId is separate for each", async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    const body = reflectionPayload({ note: 'A-ONLY' });
    const mine = (await post(a.client, body)).json();
    expect((await b.client.get(`${API}/reflections`)).json().items).toEqual([]);
    expect((await b.client.delete(`${API}/reflections/${mine.id}`)).statusCode).toBe(404);
    const theirs = await post(b.client, body);
    expect(theirs.statusCode).toBe(201);
    expect(theirs.json().id).not.toBe(mine.id);
    expect((await a.client.get(`${API}/reflections`)).json().items).toEqual([mine]);
  });

  it('counts against the per-account rate limit, as every signed-in route does', async () => {
    const { client } = await signInConsented(h);
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await client.get(`${API}/reflections`)).statusCode;
    expect(last).toBe(429);
  });
});

describe('reflections: at rest', () => {
  it('a raw select shows no question ids, answers or notes, and every row is the same size', async () => {
    const { client, id } = await signInConsented(h);
    await post(client, reflectionPayload({ note: '' }));
    await post(client, reflectionPayload({ note: 'SECRET-REFLECTION-NOTE' }));
    await post(client, reflectionPayload({ note: '\u0001'.repeat(280) }));
    await post(client, reflectionPayload({ note: 'मन'.repeat(140) }));
    const rows = await h.admin.unsafe(`SELECT * FROM app.reflections WHERE user_id = '${id}'::uuid`);
    expect(rows).toHaveLength(4);
    const dump = rows
      .flatMap((row) => Object.values(row).map((v) => (v instanceof Uint8Array ? `${Buffer.from(v).toString('latin1')} ${Buffer.from(v).toString('hex')}` : String(v))))
      .join(' ');
    for (const secret of ['REF-', 'SECRET-REFLECTION-NOTE', '"answers"', '"q"', '"note"']) expect(dump).not.toContain(secret);
    const sizes = new Set(rows.map((r) => (r.payload_ct as Buffer).length));
    expect(sizes.size).toBe(1);
  });

  it('swapping ciphertext between two reflections of one person fails, opaquely', async () => {
    const { client, id } = await signInConsented(h);
    const x = (await post(client, reflectionPayload())).json();
    const y = (await post(client, reflectionPayload())).json();
    await h.admin`
      UPDATE app.reflections r SET payload_ct = s.payload_ct FROM app.reflections s
      WHERE r.user_id = ${id}::uuid AND r.id = ${x.id}::uuid AND s.id = ${y.id}::uuid
    `;
    const r = await client.get(`${API}/reflections`);
    expect(r.statusCode).toBe(500);
    expect(r.json().code).toBe('internal_error');
    expect(r.body).not.toMatch(/decrypt|aes|gcm|cipher|REF-/i);
  });

  it("a reflection moved to another person's account can't be read", async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    await post(a.client, reflectionPayload());
    await h.admin`UPDATE app.reflections SET user_id = ${b.id}::uuid WHERE user_id = ${a.id}::uuid`;
    const r = await b.client.get(`${API}/reflections`);
    expect(r.statusCode).toBe(500);
    expect(r.json().code).toBe('internal_error');
  });
});
