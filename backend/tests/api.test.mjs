// Integration tests: run against a LIVE dev server + a TEST database.
//   php -S 127.0.0.1:8000 backend/dev-router.php &
//   BEA_TEST_DB=bea_test node --test backend/tests/
// WARNING: wipes enquiries / admissions / receipts in the test database.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BEA_API || 'http://127.0.0.1:8000';
const DB = process.env.BEA_TEST_DB || 'bea_test';
if (!/test/i.test(DB)) throw new Error('Refusing to run: database name must contain "test"');

const sql = (q) => execFileSync('mysql', [DB, '-N', '-B', '-e', q], { encoding: 'utf8' }).trim();

class Client {
  cookie = '';
  csrf = '';
  async call(method, path, body, headers = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.csrf && method !== 'GET' ? { 'X-CSRF-Token': this.csrf } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    // Like a browser: when several Set-Cookie headers arrive (session start + regenerate), the last one wins.
    const all = res.headers.getSetCookie();
    if (all.length) this.cookie = all[all.length - 1].split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  get = (p) => this.call('GET', p);
  post = (p, b = {}) => this.call('POST', p, b);
  put = (p, b = {}) => this.call('PUT', p, b);
  async login(email, password) {
    const r = await this.post('/auth/login', { email, password });
    if (r.status === 200) this.csrf = r.json.data.csrf;
    return r;
  }
}

const admin = new Client();
const staff = new Client();
let today;
let n = 0;
const phone = () => '9' + String(100000000 + 1000 * (++n) + Math.floor(Math.random() * 999)).slice(0, 9);
const uid = () => crypto.randomUUID();
const newEnquiry = (over = {}) => ({ student_name: 'Test Student ' + (++n), phone: phone(), source: 'meta_ads', idempotency_key: uid(), ...over });
const plusDays = (d, k) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };

before(async () => {
  sql('SET FOREIGN_KEY_CHECKS=0; TRUNCATE followups; TRUNCATE receipts; TRUNCATE admissions; TRUNCATE enquiries; TRUNCATE audit_logs; TRUNCATE counters; TRUNCATE rate_limits; DELETE FROM users WHERE role <> "admin"; DELETE FROM courses WHERE name = "IELTS Crash Course"; SET FOREIGN_KEY_CHECKS=1;');
  const r = await admin.login('owner@test.com', 'Admin@12345');
  assert.equal(r.status, 200, r.text);
  today = (await admin.get('/followups')).json.meta.today;
  const u = await admin.post('/users', { name: 'Counsellor One', email: 'c1@test.com', role: 'counsellor', password: 'Counsel@123' });
  assert.equal(u.status, 201, u.text);
  assert.equal((await staff.login('c1@test.com', 'Counsel@123')).status, 200);
});

test('auth: unauthenticated, bad login, csrf, rate limit', async () => {
  const anon = new Client();
  assert.equal((await anon.get('/enquiries')).status, 401);
  assert.equal((await anon.post('/auth/login', { email: 'owner@test.com', password: 'wrong' })).status, 401);
  // CSRF: valid session cookie but no token
  const noCsrf = new Client();
  await noCsrf.login('owner@test.com', 'Admin@12345');
  noCsrf.csrf = '';
  const r = await noCsrf.post('/enquiries', newEnquiry());
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'csrf_failed');
  // Non-JSON mutating body is refused
  const bad = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(bad.status, 415);
  // Brute force lock after 5 failures for one account
  const b = new Client();
  for (let i = 0; i < 5; i++) await b.post('/auth/login', { email: 'brute@test.com', password: 'nope' + i });
  assert.equal((await b.post('/auth/login', { email: 'brute@test.com', password: 'nope' })).status, 429);
  sql('TRUNCATE rate_limits');
});

test('enquiry: validation + normalisation', async () => {
  let r = await admin.post('/enquiries', { student_name: '', phone: '12345', source: 'nope' });
  assert.equal(r.status, 422);
  assert.ok(r.json.error.fields.student_name && r.json.error.fields.phone && r.json.error.fields.source);
  const p = phone();
  r = await admin.post('/enquiries', newEnquiry({ phone: '+91 ' + p.slice(0, 5) + '-' + p.slice(5), student_name: '  Riya   Sharma ' }));
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.data.phone, p);
  assert.equal(r.json.data.student_name, 'Riya Sharma');
  assert.equal(r.json.data.status, 'new');
  assert.equal(r.json.data.next_follow_up_date, today, 'default first follow-up is today');
  r = await admin.post('/enquiries', newEnquiry({ next_follow_up_date: plusDays(today, -1) }));
  assert.equal(r.status, 422);
});

test('duplicates: same number in any format, alt number, idempotent retry, and a 10-way race', async () => {
  const p = phone();
  const first = await admin.post('/enquiries', newEnquiry({ phone: p }));
  assert.equal(first.status, 201);

  let r = await staff.post('/enquiries', newEnquiry({ phone: `0${p.slice(0, 4)} ${p.slice(4)}` }));
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'duplicate');
  assert.equal(r.json.error.existing.id, first.json.data.id);

  // alt number equal to someone else's main number
  r = await admin.post('/enquiries', newEnquiry({ alt_phone: p }));
  assert.equal(r.status, 409);

  // double-click / network retry with the same idempotency key
  const body = newEnquiry();
  const a = await admin.post('/enquiries', body);
  const b = await admin.post('/enquiries', body);
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal(b.json.replayed, true);
  assert.equal(a.json.data.id, b.json.data.id);

  // race: 10 simultaneous saves of the same number from two users with different keys
  const racePhone = phone();
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? admin : staff).post('/enquiries', newEnquiry({ phone: racePhone }))));
  const codes = results.map((x) => x.status).sort();
  assert.equal(codes.filter((c) => c === 201).length, 1, JSON.stringify(codes));
  assert.equal(codes.filter((c) => c === 409).length, 9, JSON.stringify(codes));
  assert.equal(sql(`SELECT COUNT(*) FROM enquiries WHERE phone_normalized='${racePhone}'`), '1');

  const chk = await admin.get(`/enquiries/check-duplicate?phone=${p}`);
  assert.equal(chk.json.data.exists, true);
});

test('optimistic locking: stale edit is refused, fresh edit works', async () => {
  const e = (await admin.post('/enquiries', newEnquiry())).json.data;
  const ok = await staff.put(`/enquiries/${e.id}`, { version: e.version, city: 'Indore' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.data.city, 'Indore');
  const stale = await admin.put(`/enquiries/${e.id}`, { version: e.version, city: 'Bhopal' });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, 'version_conflict');
  assert.equal(sql(`SELECT city FROM enquiries WHERE id=${e.id}`), 'Indore');
});

test("today's follow-ups: due today, overdue carry-over, 7-day auto-resurface, upcoming hidden", async () => {
  sql('UPDATE enquiries SET next_follow_up_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY)'); // park everything
  const mk = async (over) => (await admin.post('/enquiries', newEnquiry(over))).json.data;
  const dueToday = await mk({ next_follow_up_date: today });
  const overdue = await mk({});
  const stale8 = await mk({});
  const fresh3 = await mk({});
  const tomorrow = await mk({ next_follow_up_date: plusDays(today, 1) });
  sql(`UPDATE enquiries SET next_follow_up_date = DATE_SUB('${today}', INTERVAL 3 DAY) WHERE id=${overdue.id}`);
  sql(`UPDATE enquiries SET next_follow_up_date = NULL, created_at = DATE_SUB(NOW(), INTERVAL 8 DAY) WHERE id=${stale8.id}`);
  sql(`UPDATE enquiries SET next_follow_up_date = NULL, created_at = DATE_SUB(NOW(), INTERVAL 3 DAY) WHERE id=${fresh3.id}`);

  const r = await admin.get('/followups?scope=all');
  assert.equal(r.status, 200, r.text);
  const ids = r.json.data.map((x) => x.id);
  assert.ok(ids.includes(dueToday.id), 'due today present');
  assert.ok(ids.includes(overdue.id), 'overdue carried into today');
  assert.ok(ids.includes(stale8.id), '8-day untouched enquiry resurfaces');
  assert.ok(!ids.includes(fresh3.id), '3-day untouched enquiry does not');
  assert.ok(!ids.includes(tomorrow.id), 'tomorrow is not today');
  const by = Object.fromEntries(r.json.data.map((x) => [x.id, x]));
  assert.equal(by[dueToday.id].due_state, 'today');
  assert.equal(by[overdue.id].due_state, 'overdue');
  assert.equal(by[overdue.id].days_overdue, 3);
  assert.equal(by[stale8.id].auto_added, true);
  assert.equal(r.json.counts.today, 1);
  assert.equal(r.json.counts.overdue, 2);
  assert.equal(r.json.counts.auto, 1);
  assert.equal(r.json.counts.upcoming, 2, 'tomorrow + the 3-day-old (due in 4 days) are upcoming, not due');

  const up = await admin.get('/followups?scope=all&filter=upcoming');
  assert.deepEqual(up.json.data.map((x) => x.id).sort(), [tomorrow.id, fresh3.id].sort());
  const od = await admin.get('/followups?scope=all&filter=overdue');
  assert.deepEqual(od.json.data.map((x) => x.id).sort(), [overdue.id, stale8.id].sort());
  const au = await admin.get('/followups?scope=all&filter=auto');
  assert.deepEqual(au.json.data.map((x) => x.id), [stale8.id]);

  // Completing a follow-up removes it from today's list and records the timeline.
  const key = uid();
  let f = await staff.post(`/enquiries/${overdue.id}/followups`, { type: 'call', outcome: 'interested', note: 'Wants evening batch', next_follow_up_date: plusDays(today, 2), idempotency_key: key });
  assert.equal(f.status, 201, f.text);
  assert.equal(f.json.data.status, 'follow_up');
  assert.equal(f.json.data.next_follow_up_date, plusDays(today, 2));
  assert.equal(f.json.timeline.length, 1);
  f = await staff.post(`/enquiries/${overdue.id}/followups`, { type: 'call', outcome: 'interested', note: 'Wants evening batch', next_follow_up_date: plusDays(today, 2), idempotency_key: key });
  assert.equal(f.json.replayed, true);
  assert.equal(sql(`SELECT COUNT(*) FROM followups WHERE enquiry_id=${overdue.id}`), '1', 'retry did not duplicate the follow-up');
  const after = await admin.get('/followups?scope=all');
  assert.ok(!after.json.data.map((x) => x.id).includes(overdue.id));
});

test('follow-up rules: next date mandatory, past refused, lost needs reason, reopen', async () => {
  const e = (await admin.post('/enquiries', newEnquiry())).json.data;
  let r = await admin.post(`/enquiries/${e.id}/followups`, { type: 'call', outcome: 'not_picked' });
  assert.equal(r.status, 422);
  assert.ok(r.json.error.fields.next_follow_up_date);
  r = await admin.post(`/enquiries/${e.id}/followups`, { type: 'call', outcome: 'busy', next_follow_up_date: plusDays(today, -2) });
  assert.equal(r.status, 422);
  r = await admin.post(`/enquiries/${e.id}/followups`, { type: 'call', outcome: 'not_interested' });
  assert.equal(r.status, 422);
  assert.ok(r.json.error.fields.lost_reason);
  r = await admin.post(`/enquiries/${e.id}/followups`, { type: 'call', outcome: 'not_interested', lost_reason: 'fee_high', note: 'Fees high' });
  assert.equal(r.status, 201);
  assert.equal(r.json.data.status, 'lost');
  assert.equal(r.json.data.next_follow_up_date, null);
  assert.equal(r.json.data.due_state, null);
  r = await admin.post(`/enquiries/${e.id}/followups`, { type: 'call', outcome: 'interested', next_follow_up_date: today });
  assert.equal(r.status, 409);
  r = await admin.post(`/enquiries/${e.id}/reopen`, { next_follow_up_date: plusDays(today, 1) });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.status, 'follow_up');
});

const admitBody = (over = {}) => ({
  course_id: 1, total_fee: '12000', discount: '1000', amount: '5000', payment_mode: 'upi', reference_no: 'UPI123456',
  next_due_date: plusDays(today, 30), batch_timing: '6-7 PM', idempotency_key: uid(), ...over,
});

test('admission: confirms, creates professional receipt, closes enquiry; guards', async () => {
  const e = (await admin.post('/enquiries', newEnquiry({ student_name: 'Aarav Patel', parent_name: 'Mr. Patel' }))).json.data;
  let r = await staff.post(`/enquiries/${e.id}/admit`, admitBody({ amount: '12000' }));
  assert.equal(r.status, 422, 'amount above net fee refused');
  assert.ok(r.json.error.fields.amount);
  r = await staff.post(`/enquiries/${e.id}/admit`, admitBody({ reference_no: '' }));
  assert.equal(r.status, 422, 'UPI needs a reference');
  r = await staff.post(`/enquiries/${e.id}/admit`, admitBody({ next_due_date: '' }));
  assert.equal(r.status, 422, 'pending balance needs a due date');
  assert.equal(sql(`SELECT COUNT(*) FROM admissions WHERE enquiry_id=${e.id}`), '0', 'failed attempts left nothing behind');

  const body = admitBody();
  r = await staff.post(`/enquiries/${e.id}/admit`, body);
  assert.equal(r.status, 201, r.text);
  const { admission, receipt } = r.json.data;
  assert.match(receipt.receipt_no, /^BEA\/2026-27\/0001$/);
  assert.match(admission.admission_no, /^BEA\/ADM\/2026-27\/0001$/);
  assert.equal(admission.net_fee, 11000);
  assert.equal(admission.paid_amount, 5000);
  assert.equal(admission.balance, 6000);
  assert.equal(receipt.balance_after, 6000);
  assert.equal(receipt.student_name, 'Aarav Patel');
  assert.equal(receipt.academy.name, 'Brahma English Academy');

  const enq = (await admin.get(`/enquiries/${e.id}`)).json.data;
  assert.equal(enq.enquiry.status, 'admitted');
  assert.equal(enq.enquiry.next_follow_up_date, null);
  assert.equal(enq.timeline[0].outcome, 'admitted');
  assert.ok(!(await admin.get('/followups?scope=all')).json.data.some((x) => x.id === e.id));

  // retry with same key: same receipt, nothing duplicated
  const again = await staff.post(`/enquiries/${e.id}/admit`, body);
  assert.equal(again.status, 200);
  assert.equal(again.json.data.receipt.receipt_no, receipt.receipt_no);
  // second admission for same student with a new key: refused
  const dup = await staff.post(`/enquiries/${e.id}/admit`, admitBody());
  assert.equal(dup.status, 409);
  assert.equal(sql(`SELECT COUNT(*) FROM admissions WHERE enquiry_id=${e.id}`), '1');
  assert.equal(sql('SELECT COUNT(*) FROM receipts'), '1');
});

test('admission race: 6 simultaneous confirmations create exactly one admission and one receipt', async () => {
  const e = (await admin.post('/enquiries', newEnquiry())).json.data;
  const before = Number(sql('SELECT COUNT(*) FROM receipts'));
  const res = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? admin : staff).post(`/enquiries/${e.id}/admit`, admitBody())));
  const codes = res.map((x) => x.status).sort();
  assert.equal(codes.filter((c) => c === 201).length, 1, JSON.stringify(codes));
  assert.ok(codes.every((c) => c === 201 || c === 409), JSON.stringify(codes));
  assert.equal(sql(`SELECT COUNT(*) FROM admissions WHERE enquiry_id=${e.id}`), '1');
  assert.equal(Number(sql('SELECT COUNT(*) FROM receipts')), before + 1);
});

test('instalments: gap-free numbers, no overpayment under parallel load, totals always reconcile', async () => {
  const e = (await admin.post('/enquiries', newEnquiry())).json.data;
  const a = (await staff.post(`/enquiries/${e.id}/admit`, admitBody({ total_fee: '1000', discount: '0', amount: '100' }))).json.data.admission;
  assert.equal(a.balance, 900);

  // 5 parallel payments of 300 against a 900 balance: only 3 can succeed
  const pay = () => staff.post(`/admissions/${a.id}/payments`, { amount: '300', payment_mode: 'cash', next_due_date: plusDays(today, 10), idempotency_key: uid() });
  const res = await Promise.all([pay(), pay(), pay(), pay(), pay()]);
  const ok = res.filter((x) => x.status === 201);
  assert.equal(ok.length, 3, res.map((x) => x.status).join());
  assert.ok(res.filter((x) => x.status !== 201).every((x) => x.status === 422));
  const adm = (await admin.get(`/admissions/${a.id}`)).json.data;
  assert.equal(adm.admission.paid_amount, 1000);
  assert.equal(adm.admission.balance, 0);
  assert.equal(adm.admission.status, 'completed');
  assert.equal(adm.admission.next_due_date, null);
  assert.equal(sql(`SELECT SUM(amount) FROM receipts WHERE admission_id=${a.id} AND status='valid'`), '1000.00');

  // nothing left to pay
  const over = await staff.post(`/admissions/${a.id}/payments`, { amount: '1', payment_mode: 'cash' });
  assert.equal(over.status, 422);

  // receipt numbers are unique and contiguous
  const nos = sql("SELECT receipt_no FROM receipts ORDER BY id").split('\n').map((s) => Number(s.split('/').pop()));
  assert.deepEqual(nos, nos.map((_, i) => i + 1), 'no gaps, no repeats: ' + nos.join());
});

test('void receipt: admin only, reason mandatory, balance restored, record kept', async () => {
  const e = (await admin.post('/enquiries', newEnquiry())).json.data;
  const { admission, receipt } = (await staff.post(`/enquiries/${e.id}/admit`, admitBody({ total_fee: '2000', discount: '0', amount: '2000' }))).json.data;
  assert.equal(admission.status, 'completed');
  assert.equal((await staff.post(`/receipts/${receipt.id}/void`, { reason: 'wrong entry here' })).status, 403);
  assert.equal((await admin.post(`/receipts/${receipt.id}/void`, { reason: 'x' })).status, 422);
  const v = await admin.post(`/receipts/${receipt.id}/void`, { reason: 'Entered wrong amount' });
  assert.equal(v.status, 200);
  assert.equal(v.json.data.status, 'void');
  const a = (await admin.get(`/admissions/${admission.id}`)).json.data;
  assert.equal(a.admission.paid_amount, 0);
  assert.equal(a.admission.balance, 2000);
  assert.equal(a.admission.status, 'active');
  assert.ok(a.admission.next_due_date, 'due date set so it shows in fees due');
  assert.equal(a.receipts.length, 1, 'void receipt is still on record');
  assert.equal((await admin.post(`/receipts/${receipt.id}/void`, { reason: 'again again' })).status, 409);
  assert.equal(sql(`SELECT COUNT(*) FROM receipts WHERE id=${receipt.id}`), '1');
});

test('fees due list + dashboard numbers', async () => {
  const d = await admin.get('/fees/due');
  assert.equal(d.status, 200);
  assert.ok(d.json.counts.pending >= 1);
  const s = await admin.get('/dashboard?days=30');
  assert.equal(s.status, 200, s.text);
  const k = s.json.data.kpi;
  assert.ok(k.enquiries_period > 5);
  assert.ok(k.admissions_period >= 3);
  assert.equal(s.json.data.trend.length, 30);
  assert.ok(s.json.data.by_source.find((x) => x.source === 'meta_ads').enquiries > 0);
  // revenue equals sum of valid receipts
  assert.equal(k.revenue_period, Number(sql("SELECT COALESCE(SUM(amount),0) FROM receipts WHERE status='valid'")));
  const st = await staff.get('/dashboard');
  assert.equal(st.status, 200);
  assert.deepEqual(st.json.data.team, [], 'staff never sees team stats');
});

test('permissions: counsellor cannot reach admin features', async () => {
  for (const p of ['/users', '/audit-logs', '/enquiries/export', '/backup/download']) {
    assert.equal((await staff.get(p)).status, 403, p);
  }
  assert.equal((await staff.post('/courses', { name: 'X', fee: '1' })).status, 403);
  assert.equal((await staff.put('/settings', { academy_name: 'Hacked' })).status, 403);
  const e = (await admin.post('/enquiries', newEnquiry())).json.data;
  assert.equal((await staff.post(`/enquiries/${e.id}/archive`, { reason: 'cleaning up' })).status, 403);
});

test('archive keeps the record and keeps the number reserved; restore works', async () => {
  const p = phone();
  const e = (await admin.post('/enquiries', newEnquiry({ phone: p }))).json.data;
  assert.equal((await admin.post(`/enquiries/${e.id}/archive`, { reason: 'Test entry by mistake' })).status, 200);
  assert.equal(sql(`SELECT COUNT(*) FROM enquiries WHERE id=${e.id}`), '1', 'row not deleted');
  assert.ok(!(await admin.get('/enquiries?per_page=100')).json.data.some((x) => x.id === e.id));
  assert.equal((await staff.post('/enquiries', newEnquiry({ phone: p }))).status, 409, 'number still protected');
  assert.ok((await admin.get('/enquiries?archived=1')).json.data.some((x) => x.id === e.id));
  assert.equal((await admin.post(`/enquiries/${e.id}/restore`)).status, 200);
});

test('CSV export neutralises spreadsheet formulas and is audited', async () => {
  await admin.post('/enquiries', newEnquiry({ student_name: '=HYPERLINK("http://evil","x")' }));
  const r = await admin.get('/enquiries/export');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.text, /'=HYPERLINK/);
  assert.ok(!/,=HYPERLINK/.test(r.text));
  assert.ok(Number(sql("SELECT COUNT(*) FROM audit_logs WHERE action='export'")) >= 1);
});

test('public website form: key, honeypot, merge duplicates instead of creating them', async () => {
  const p = phone();
  const body = { key: 'public-test-key', student_name: 'Web Lead', phone: p, course: 'Spoken English', campaign: 'diwali-offer', message: 'Call me after 5pm' };
  const anon = new Client();
  assert.equal((await anon.post('/public/enquiry', { ...body, key: 'wrong' })).status, 403);
  const ok = await anon.post('/public/enquiry', body);
  assert.equal(ok.status, 200, ok.text);
  const row = sql(`SELECT source, campaign, course_id IS NOT NULL FROM enquiries WHERE phone_normalized='${p}'`).split('\t');
  assert.deepEqual(row, ['website', 'diwali-offer', '1']);
  // same person submits again: still exactly one enquiry, but a re-enquiry note is added and it is due today
  sql(`UPDATE enquiries SET next_follow_up_date = DATE_ADD(CURDATE(), INTERVAL 20 DAY) WHERE phone_normalized='${p}'`);
  const again = await anon.post('/public/enquiry', body);
  assert.equal(again.status, 200);
  assert.equal(sql(`SELECT COUNT(*) FROM enquiries WHERE phone_normalized='${p}'`), '1');
  assert.equal(sql(`SELECT COUNT(*) FROM followups f JOIN enquiries e ON e.id=f.enquiry_id WHERE e.phone_normalized='${p}' AND f.outcome='reenquiry'`), '1');
  assert.equal(sql(`SELECT next_follow_up_date = CURDATE() FROM enquiries WHERE phone_normalized='${p}'`), '1');
  // honeypot: pretends success, saves nothing
  const hp = phone();
  assert.equal((await anon.post('/public/enquiry', { ...body, phone: hp, company: 'bot' })).status, 200);
  assert.equal(sql(`SELECT COUNT(*) FROM enquiries WHERE phone_normalized='${hp}'`), '0');
});

test('audit trail and backup', async () => {
  const logs = await admin.get('/audit-logs?per_page=200');
  assert.equal(logs.status, 200);
  const actions = new Set(logs.json.data.map((l) => l.action));
  for (const a of ['create', 'followup', 'admit', 'payment', 'void', 'archive', 'update']) assert.ok(actions.has(a), 'missing audit action ' + a);
  const res = await fetch(BASE + '/backup/download', { headers: { Cookie: admin.cookie } });
  assert.equal(res.status, 200);
  const gz = Buffer.from(await res.arrayBuffer());
  const { gunzipSync } = await import('node:zlib');
  const dump = gunzipSync(gz).toString('utf8');
  assert.match(dump, /CREATE TABLE `enquiries`/);
  assert.match(dump, /INSERT INTO `receipts`/);
  assert.match(dump, /End of backup/);
});

test('admin: course & user management safety', async () => {
  const c = await admin.post('/courses', { name: 'IELTS Crash Course', fee: '8500', duration: '2 months' });
  assert.equal(c.status, 201);
  assert.equal((await admin.post('/courses', { name: 'IELTS Crash Course', fee: '1' })).status, 422);
  const me = (await admin.get('/auth/me')).json.data.user;
  assert.equal((await admin.put(`/users/${me.id}`, { role: 'counsellor' })).status, 409, 'cannot demote the last admin / yourself');
  assert.equal((await admin.put(`/users/${me.id}`, { is_active: 0 })).status, 409);
  const weak = await admin.post('/users', { name: 'W', email: 'w@test.com', role: 'counsellor', password: 'short' });
  assert.equal(weak.status, 422);
});
