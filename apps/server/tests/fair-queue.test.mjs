import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FairQueue } from '../src/fair-queue.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('jobs alternate between keys and run one at a time', async () => {
  const queue = new FairQueue(10);
  const order = [];
  let active = 0;
  const job = (label) => async () => {
    active += 1;
    assert.equal(active, 1);
    await tick();
    order.push(label);
    active -= 1;
    return label;
  };
  const results = Promise.all([
    queue.run('a', job('a1')),
    queue.run('a', job('a2')),
    queue.run('a', job('a3')),
    queue.run('a', job('a4')),
    queue.run('b', job('b1')),
    queue.run('c', job('c1')),
    queue.run('b', job('b2')),
  ]);
  assert.deepEqual(await results, ['a1', 'a2', 'a3', 'a4', 'b1', 'c1', 'b2']);
  // Without fairness b1 and c1 would wait for all of a's jobs.
  assert.deepEqual(order, ['a1', 'b1', 'c1', 'a2', 'b2', 'a3', 'a4']);
});

test('a failing job rejects only its own caller', async () => {
  const queue = new FairQueue(10);
  const failing = queue.run('a', async () => {
    throw new Error('tool failed');
  });
  const next = queue.run('a', async () => 'ok');
  await assert.rejects(failing, /tool failed/);
  assert.equal(await next, 'ok');
  assert.equal(queue.pending('a'), 0);
});

test('a key cannot queue more than its limit', async () => {
  const queue = new FairQueue(2);
  let release;
  const blocker = new Promise((resolve) => (release = resolve));
  const first = queue.run('a', () => blocker);
  const second = queue.run('a', async () => undefined);
  assert.equal(queue.pending('a'), 2);
  assert.throws(() => queue.run('a', async () => undefined), { status: 429 });
  // Other keys are not affected by a's limit.
  const other = queue.run('b', async () => 'b');
  release();
  await Promise.all([first, second]);
  assert.equal(await other, 'b');
  assert.equal(queue.pending('a'), 0);
});
