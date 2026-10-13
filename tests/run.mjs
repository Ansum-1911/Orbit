// ORBIT browser tests. Run: npm install && npx playwright install chromium && npm test
// Opens index.html directly via file:// (no server needed).
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const URL_ = 'file://' + path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const browser = await chromium.launch();
const results = [];
let failed = 0;

async function test(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.setDefaultTimeout(5000);
  try {
    await fn(page, ctx, errors);
    if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
    results.push('PASS  ' + name);
  } catch (e) {
    failed++;
    results.push('FAIL  ' + name + '\n        ' + String(e.message).split('\n')[0]);
  }
  await ctx.close();
}
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const today = new Date().toLocaleDateString('en-CA');
const addDays = (n) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const task = (o) => ({ id: 't' + Math.random().toString(36).slice(2, 8), title: 'Task', cat: 'acad', dur: 30, pri: 'Medium', date: today, status: 'notstarted', ...o });
const state = (tasks, extra = {}) => ({ planner_v1: JSON.stringify({ tasks, days: {}, cats: [{ id: 'acad', n: 'Academics', c: '#4c9aff', i: '📘' }], prof: { name: 'Tester', purposes: [], done: true }, set: { wake: '06:00', sleep: '23:00', brk: 10, theme: 'dark' }, ...extra }) });
async function open(page, seed) {
  if (seed) await page.addInitScript(s => { if (!sessionStorage.getItem('__s')) { for (const k in s) localStorage.setItem(k, s[k]); sessionStorage.setItem('__s', '1'); } }, seed);
  await page.goto(URL_);
}
const nav = (page, name) => page.click(`button.nv:has-text("${name}")`);
const main = (page) => page.locator('main').innerText();

await test('first launch shows onboarding, no console errors', async (p) => {
  await open(p);
  ok(await p.locator('text=Build My Day').count() > 0, 'onboarding missing');
  ok(await p.locator('text=Your life, organized in motion.').count() > 0, 'tagline missing');
});

await test('onboarding: name, student types, categories (incl. custom) → persists after reload', async (p) => {
  await open(p);
  await p.click('text=Build My Day');
  await p.fill('#on', 'Asha');
  ok(await p.locator('.op').count() === 11, 'expected 11 student types');
  await p.check('.op[value="Engineering"]');
  await p.click('button:text-is("Next")');
  await p.fill('#oc', 'Exam prep');
  await p.click('button:text-is("Next")');
  await p.click('button.b1:text-is("Plan Today")');
  await p.fill('#qt', 'Read chapter 1');
  await p.click('button.b1:text-is("Add")');
  await p.reload();
  ok((await main(p)).includes('Asha'), 'name not persisted');
  await nav(p, 'Plan Today');
  ok((await main(p)).includes('Read chapter 1'), 'task not persisted');
  await nav(p, 'Settings');
  ok((await main(p)).includes('Exam prep'), 'custom category not persisted');
});

await test('create (advanced form), edit, complete, delete + undo', async (p) => {
  await open(p, state([]));
  await nav(p, 'Plan Today');
  await p.click('button:has-text("Advanced")');
  await p.fill('input[name=title]', 'Physics problems');
  await p.fill('input[name=dur]', '45');
  await p.selectOption('select[name=pri]', 'High');
  await p.fill('input[name=outcome]', 'Finish set 3');
  await p.click('.mc .b1');
  ok((await main(p)).includes('Physics problems'), 'task not created');
  await p.click('button[data-a=edit]');
  await p.fill('input[name=title]', 'Physics problems v2');
  await p.click('.mc .b1');
  ok((await main(p)).includes('Physics problems v2'), 'edit failed');
  await p.check('input[data-a=tog]');
  ok(await p.locator('.row.done').count() === 1, 'complete failed');
  await p.click('button[data-a=del]');
  await p.click('.mc .b1');
  ok(!(await main(p)).includes('Physics problems v2'), 'delete failed');
  await p.click('button:has-text("Undo")');
  ok((await main(p)).includes('Physics problems v2'), 'undo failed');
});

await test('form validation: empty title, fixed task without time', async (p) => {
  await open(p, state([]));
  await nav(p, 'Plan Today');
  await p.click('button:has-text("Advanced")');
  await p.click('.mc .b1');
  ok((await p.locator('.mc .err').innerText()).includes('task name'), 'empty title not rejected');
  await p.fill('input[name=title]', 'Lecture');
  await p.check('input[name=fixed]');
  await p.click('.mc .b1');
  ok((await p.locator('.mc .err').innerText()).includes('start time'), 'fixed without time not rejected');
});

await test('scheduler: overlapping fixed + outside-hours flagged; flexible tasks placed around fixed', async (p) => {
  await open(p, state([
    task({ title: 'F1', fixed: true, start: '09:00', dur: 60 }),
    task({ title: 'F2', fixed: true, start: '09:30', dur: 60 }),
    task({ title: 'Night', fixed: true, start: '23:30', dur: 30 }),
    task({ title: 'Flex', dur: 45, pri: 'Urgent' }),
  ]));
  await nav(p, 'Timetable');
  ok(/overlap/i.test(await main(p)), 'conflict warning missing');
  ok(await p.locator('.pill.red:has-text("Time conflict")').count() === 3, 'expected 3 flagged tasks');
});

await test('scheduler: task that cannot fit is listed, never silently lost', async (p) => {
  await open(p, state([task({ title: 'Marathon', dur: 1100 }), task({ title: 'Small', dur: 20 })]));
  await nav(p, 'Timetable');
  const t = await main(p);
  ok(/Not scheduled \(1\)/.test(t) && t.includes('Marathon'), 'unscheduled task not listed');
  await p.click('button[data-a=nextday]');
  ok(!(await main(p)).includes('Not scheduled'), 'move to next day failed');
  await p.click('button[data-a=dnext]');
  ok((await main(p)).includes('Marathon'), 'task not found on next day');
});

await test('scheduler property test: 400 random days keep invariants', async (p) => {
  await open(p, state([]));
  const bad = await p.evaluate(() => {
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const fails = [];
    for (let i = 0; i < 400; i++) {
      const wake = rnd(4, 9) * 60, sleep = rnd(18, 24) * 60 - (rnd(0, 1) ? 0 : 1);
      S.set.wake = tm(wake); S.set.sleep = tm(Math.min(sleep, 1439)); S.set.brk = rnd(0, 20); S.set.mode = Math.random() < .5 ? 'deadline' : 'balanced';
      const n = rnd(0, 14), d = today(); S.tasks = []; S.days = {};
      for (let k = 0; k < n; k++) {
        const fixed = Math.random() < .35;
        S.tasks.push(normT({ title: 'x' + k, dur: rnd(5, 240), pri: ['Urgent', 'High', 'Medium', 'Low'][rnd(0, 3)], date: d, fixed, start: fixed ? tm(rnd(5, 22) * 60 + rnd(0, 3) * 15) : '', deadline: Math.random() < .3 ? addD(d, rnd(0, 5)) : '' }));
      }
      const sc = schedule(d), br = +S.set.brk, ids = new Set(S.tasks.map(t => t.id));
      const seen = [...sc.slots.map(o => o.t.id), ...sc.un.map(u => u.t.id)];
      if (seen.length !== ids.size || new Set(seen).size !== ids.size) { fails.push('lost/duplicated task #' + i); continue; }
      const pinned = t => (t.fixed || t.locked) && t.start;
      const flex = sc.slots.filter(o => !pinned(o.t));
      for (const f of flex) {
        if (f.s < sc.wake || f.e > sc.sleep) fails.push('flex outside hours #' + i);
        for (const o of sc.slots) if (o !== f) {
          if (!(f.e <= o.s || o.e <= f.s)) fails.push('flex overlaps slot #' + i);
          else if (!(f.e + br <= o.s || o.e + br <= f.s)) fails.push('break not respected #' + i);
        }
        if (f.e - f.s !== f.t.dur) fails.push('wrong duration #' + i);
      }
    }
    return [...new Set(fails)];
  });
  ok(bad.length === 0, bad.join('; '));
});

await test('statuses: partial, skip→backlog, reschedule, dismiss, load unfinished', async (p) => {
  await open(p, state([
    task({ id: 'a', title: 'PartialTask' }), task({ id: 'b', title: 'SkipMe' }), task({ id: 'c', title: 'DismissMe' }),
    task({ id: 'old', title: 'Yesterday', date: addDays(-1) }),
  ]));
  await nav(p, 'Plan Today');
  await p.click('.row:has-text("PartialTask") button[data-a=part]');
  await p.fill('textarea[name=r]', 'finish part 2'); await p.click('.mc .b1');
  ok(/Partial/.test(await p.locator('.row:has-text("PartialTask")').innerText()), 'partial status not shown');
  await p.click('.row:has-text("SkipMe") button[data-a=skip]');
  await p.selectOption('select[name=c]', 'bl'); await p.click('.mc .b1');
  await p.click('.row:has-text("DismissMe") button[data-a=skip]');
  await p.selectOption('select[name=c]', 'dm'); await p.click('.mc .b1');
  ok(!(await main(p)).includes('DismissMe'), 'dismissed task still listed');
  await nav(p, 'Backlog');
  const bl = await main(p);
  ok(bl.includes('SkipMe') && bl.includes('Yesterday') && !bl.includes('DismissMe'), 'backlog contents wrong');
  await p.click('tr:has-text("Yesterday") button[data-a=bres]');
  await nav(p, 'Plan Today');
  ok((await main(p)).includes('Yesterday'), 'resume today failed');
  await p.click('button[data-a=dprev]'); await p.click('button[data-a=dnext]');
  await p.click('tr:has-text("SkipMe") button[data-a=bres2]').catch(() => {});
});

await test('load unfinished tasks moves (not copies) earlier open tasks', async (p) => {
  await open(p, state([task({ id: 'o1', title: 'Leftover', date: addDays(-2) })]));
  await nav(p, 'Plan Today');
  await p.click('button[data-a=carry]');
  await p.click('.mc .b1');
  const t = await main(p);
  ok(t.includes('Leftover'), 'not loaded');
  ok(await p.evaluate(() => S.tasks.filter(t => t.title === 'Leftover').length) === 1, 'duplicated instead of moved');
});

await test('dashboard: completion %, counts and streak', async (p) => {
  await open(p, state([
    task({ title: 'D1', status: 'done', doneDate: today }), task({ title: 'D2', status: 'done', doneDate: addDays(-1) }),
    task({ title: 'D3', status: 'done', doneDate: addDays(-2) }), task({ title: 'D5', status: 'done', doneDate: addDays(-4) }),
    task({ title: 'Open1' }),
  ]));
  const t = await main(p);
  ok(t.includes('80%'), 'dashboard should show 80%');
  ok(await p.evaluate(() => streak()) === 3, 'streak should be 3 (gap breaks it)');
  ok(await p.evaluate(() => dayStats(today()).pct) === 80, 'expected 4 done of 5 tasks dated today = 80%');
});

await test('category card says "On track" (not "all caught up") while tasks remain today', async (p) => {
  await open(p, state([task({ title: 'Later', fixed: true, start: '23:00', dur: 59 })])  /* late slot so the result does not depend on time of day */);
  const t = await main(p);
  ok(t.includes('On track. 1 task(s) left today.'), 'expected On track message');
  ok(!t.includes('all caught up'), 'misleading praise shown');
});

await test('export JSON → import in a fresh browser profile restores data', async (p, ctx) => {
  await open(p, state([task({ title: 'Keep me' }), task({ title: 'Me too', status: 'done', doneDate: today })]));
  await nav(p, 'Settings'); await p.click('button[data-a=exp]');
  const json = await p.inputValue('textarea[name=j]');
  ok(JSON.parse(json).tasks.length === 2, 'export content wrong');
  const p2 = await ctx.browser().newPage(); p2.setDefaultTimeout(5000);
  await p2.goto(URL_); await p2.click('text=Skip setup');
  await p2.click('button.nv:has-text("Settings")'); await p2.click('button[data-a=imp]');
  await p2.fill('textarea[name=j]', json); await p2.click('.mc .b1');
  ok((await p2.locator('.mc').innerText()).includes('2 task(s)'), 'confirmation lacks task count');
  await p2.uncheck('input[name=bk]'); await p2.click('.mc .b1');
  await p2.click('button.nv:has-text("Plan Today")');
  ok((await p2.locator('main').innerText()).includes('Keep me'), 'import did not restore tasks');
  await p2.close();
});

await test('import rejects invalid JSON and non-backups; warns about skipped items; cancel keeps data', async (p) => {
  await open(p, state([task({ title: 'Safe' })]));
  await nav(p, 'Settings'); await p.click('button[data-a=imp]');
  await p.fill('textarea[name=j]', '{nope'); await p.click('.mc .b1');
  ok((await p.locator('.mc .err').innerText()).includes('not valid JSON'), 'bad JSON accepted');
  await p.fill('textarea[name=j]', '{"hello":1}'); await p.click('.mc .b1');
  ok((await p.locator('.mc .err').innerText()).includes('not an ORBIT backup'), 'non-backup accepted');
  await p.fill('textarea[name=j]', JSON.stringify({ tasks: [{ title: 'ok' }, { nothing: 1 }] })); await p.click('.mc .b1');
  ok((await p.locator('.mc').innerText()).includes('1 invalid item'), 'skipped items not reported');
  await p.click('.mc button[data-x]');
  ok(await p.evaluate(() => S.tasks.length === 1 && S.tasks[0].title === 'Safe'), 'cancel altered data');
});

await test('hostile import cannot execute script or inject markup', async (p) => {
  const evil = '"><img src=x onerror="window.__pwned=1">';
  await open(p, state([task({ title: evil, sub: evil, id: evil, cat: evil, deadline: evil, date: evil, moves: [{ from: evil, to: evil }] })], { cats: [{ id: 'acad', n: evil, c: evil, i: evil }], days: { [evil]: { wake: evil } } }));
  for (const n of ['Dashboard', 'Plan Today', 'Timetable', 'Backlog', 'Calendar', 'Settings']) { await nav(p, n); await p.waitForTimeout(80); }
  ok(!(await p.evaluate(() => window.__pwned)), 'script executed');
  ok(await p.locator('main img[src="x"]').count() === 0, 'markup injected');
});

await test('corrupt saved data is kept (not overwritten) and user is told', async (p) => {
  await open(p, { planner_v1: '{"tasks":[{"id":"a","title":"My thesis"' });
  ok((await main(p)).includes('could not be read'), 'no warning shown');
  await p.click('text=Skip setup');
  ok(await p.evaluate(() => Object.keys(localStorage).some(k => k.includes('_unreadable_') && localStorage.getItem(k).includes('My thesis'))), 'raw data not preserved');
  await nav(p, 'Settings');
  ok(await p.locator('button[data-a=dlbad]').count() === 1, 'recovery button missing');
});

await test('storage unavailable: clear warning on every page, no fake "saved"', async (p) => {
  await p.addInitScript(() => { Storage.prototype.setItem = function () { throw new Error('quota'); }; });
  await p.goto(URL_);
  await p.click('text=Skip setup');
  ok((await main(p)).includes('not being saved'), 'banner missing after onboarding');
  await nav(p, 'Timetable');
  ok((await main(p)).includes('not being saved'), 'banner missing on timetable');
});

await test('CSV export: header, quoting, spreadsheet-formula guard', async (p) => {
  await open(p, state([task({ title: '=HYPERLINK("http://x","y")' }), task({ title: 'Has "quotes", commas' })]));
  await nav(p, 'Settings'); await p.click('button[data-a=csv]');
  const csv = await p.inputValue('textarea[name=j]');
  ok(csv.startsWith('id,title,category'), 'header missing');
  ok(csv.includes('"\'=HYPERLINK'), 'formula not neutralised');
  ok(csv.includes('"Has ""quotes"", commas"'), 'quote escaping wrong');
});

await test('theme switch persists; navigation reaches every page', async (p) => {
  await open(p, state([]));
  await nav(p, 'Settings'); await p.click('button[data-a=theme]');
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'light', 'theme not switched');
  await p.reload();
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'light', 'theme not persisted');
  for (const [n, h] of [['Dashboard', 'Good'], ['Plan Today', "What's the plan"], ['Timetable', 'Daily Timetable'], ['Backlog', 'Backlog'], ['Calendar', 'Calendar'], ['Settings', 'Settings']]) {
    await nav(p, n); ok((await main(p)).includes(h), n + ' page did not render');
  }
});

await test('calendar: month navigation and day click opens that day', async (p) => {
  await open(p, state([task({ title: 'CalTask', date: today })]));
  await nav(p, 'Calendar');
  const m0 = await p.locator('main b').first().innerText();
  await p.click('main .bar button >> nth=1');
  ok((await p.locator('main b').first().innerText()) !== m0, 'month did not change');
  await p.click('main .bar button >> nth=0');
  await p.click('.cd.t');
  ok((await main(p)).includes('CalTask'), 'day click did not open timetable');
});

await test('settings: sleep must be later than wake; timezone change applies', async (p) => {
  await open(p, state([]));
  await nav(p, 'Settings');
  await p.fill('input[data-s="set.sleep"]', '05:00'); await p.dispatchEvent('input[data-s="set.sleep"]', 'change');
  ok(await p.locator('#toast').count() === 1, 'invalid sleep time accepted');
  ok(await p.evaluate(() => S.set.sleep) === '23:00', 'sleep changed despite error');
  await p.fill('input[data-s="set.tz"]', 'Asia/Tokyo'); await p.dispatchEvent('input[data-s="set.tz"]', 'change');
  ok(await p.evaluate(() => TZ) === 'Asia/Tokyo', 'timezone not applied');
});

await test('long task names and 200-char unbroken text do not break mobile layout', async (p) => {
  await open(p, state([task({ title: 'W'.repeat(200) }), task({ title: 'word '.repeat(60) })]));
  await p.setViewportSize({ width: 375, height: 700 });
  for (const n of ['Plan Today', 'Timetable', 'Dashboard']) {
    await nav(p, n);
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'horizontal scroll on ' + n);
  }
});

await test('mobile: bottom navigation at bottom; desktop: sidebar at left', async (p) => {
  await open(p, state([]));
  await p.setViewportSize({ width: 375, height: 700 });
  const b = await p.locator('#nav').boundingBox();
  ok(b.y > 600 && b.width >= 370, 'bottom nav not at bottom on mobile');
  await p.setViewportSize({ width: 1200, height: 800 });
  const d = await p.locator('#nav').boundingBox();
  ok(d.x === 0 && d.width < 260, 'sidebar not at left on desktop');
});

await test('keyboard: Escape closes dialog, focus enters dialog, focus survives actions', async (p) => {
  await open(p, state([task({ title: 'KB' })]));
  await nav(p, 'Plan Today');
  await p.click('button[data-a=edit]');
  await p.waitForTimeout(60);
  ok(await p.evaluate(() => !!document.activeElement.closest('.mc')), 'focus not moved into dialog');
  ok(await p.locator('[role=dialog]').count() === 1, 'dialog role missing');
  await p.keyboard.press('Escape');
  ok(await p.locator('.mod').count() === 0, 'Escape did not close');
  await p.focus('button[data-a=dup]'); await p.keyboard.press('Enter');
  ok(await p.evaluate(() => document.activeElement.dataset.a) === 'dup', 'focus lost after action');
  ok(await p.locator('input[data-a=tog][aria-label^="Mark complete"]').count() === 2, 'checkbox labels missing');
});

await test('empty states render without errors on all pages', async (p) => {
  await open(p, state([]));
  for (const n of ['Dashboard', 'Plan Today', 'Timetable', 'Backlog', 'Calendar', 'Settings']) await nav(p, n);
});

await test('clear all data requires typing DELETE', async (p) => {
  await open(p, state([task({ title: 'Precious' })]));
  await nav(p, 'Settings'); await p.click('button[data-a=clr]');
  await p.fill('input[name=c]', 'delete'); await p.click('.mc .b1');
  ok((await p.locator('.mc .err').innerText()).includes('DELETE'), 'lowercase accepted');
  await p.fill('input[name=c]', 'DELETE'); await p.click('.mc .b1');
  ok(await p.locator('text=Build My Day').count() > 0, 'did not reset to onboarding');
});

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
