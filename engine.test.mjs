import test from 'node:test';
import assert from 'node:assert/strict';
import { BrakeGame } from './engine.mjs';

const close = (actual, expected, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
};

function reachTarget(game = new BrakeGame()) {
  game.start();
  game.update(3 + 100 / 31);
  close(game.snapshot.speed, 100);
  close(game.snapshot.elapsed, 0);
  return game;
}

function controlledStop(game, dt = 1 / 120) {
  game.setPedal(true);
  for (let frame = 0; frame < 12000 && game.snapshot.phase === 'braking'; frame++) {
    const { force } = game.snapshot;
    if (force >= 1400) game.setPedal(false);
    if (force <= 1150) game.setPedal(true);
    game.update(dt);
  }
  return game.snapshot;
}

test('countdown ignores input and carries remaining time into acceleration', () => {
  const game = new BrakeGame();
  game.start();
  game.setPedal(true);
  assert.equal(game.snapshot.pedal, false);
  game.update(2);
  assert.equal(game.snapshot.phase, 'countdown');
  close(game.snapshot.countdown, 1);
  game.update(2);
  assert.equal(game.snapshot.phase, 'accelerating');
  close(game.snapshot.speed, 31);
  close(game.snapshot.travel, 31 / 7.2);
});

test('a press below 100 km/h fails immediately and terminal state is frozen', () => {
  const game = new BrakeGame();
  game.start();
  game.update(4);
  game.setPedal(true);
  assert.equal(game.snapshot.phase, 'failed');
  assert.equal(game.snapshot.failure, 'early');
  assert.equal(game.snapshot.reaction, null);
  const before = game.snapshot;
  game.update(10);
  game.setPedal(true);
  assert.deepEqual(game.snapshot, before);
});

test('timer and braking distance begin exactly at 100 km/h', () => {
  const game = reachTarget();
  close(game.snapshot.distance, 0);
  close(game.snapshot.travel, 100 ** 2 / (7.2 * 31));
  game.update(0.2);
  game.setPedal(true);
  close(game.snapshot.reaction, 0.2);
  close(game.snapshot.entrySpeed, 106.2);
  close(game.snapshot.distance, (100 * 0.2 + 31 * 0.2 ** 2 / 2) / 3.6);
  game.update(0.1);
  game.setPedal(true);
  close(game.snapshot.reaction, 0.2);
  close(game.snapshot.entrySpeed, 106.2);
});

test('holding damages the brake at exactly 1600 N in about 1.5 seconds', () => {
  const game = reachTarget();
  game.setPedal(true);
  game.update(10);
  assert.equal(game.snapshot.phase, 'failed');
  assert.equal(game.snapshot.failure, 'broken');
  assert.equal(game.snapshot.force, 1600);
  assert.equal(game.snapshot.peakForce, 1600);
  close(game.snapshot.elapsed, 1600 / 1100);
  assert.ok(game.snapshot.speed > 0);
});

test('releasing lets force decay while the car continues braking', () => {
  const game = reachTarget();
  game.setPedal(true);
  game.update(1);
  close(game.snapshot.force, 1100);
  close(game.snapshot.speed, 86.8);
  game.setPedal(false);
  game.update(0.5);
  close(game.snapshot.force, 775);
  close(game.snapshot.speed, 75.55);
  close(game.snapshot.peakForce, 1100);
});

test('controlled braking stops safely in roughly four seconds', () => {
  const result = controlledStop(reachTarget());
  assert.equal(result.phase, 'success');
  assert.equal(result.failure, null);
  assert.equal(result.speed, 0);
  assert.equal(result.reaction, 0);
  assert.ok(result.elapsed > 3 && result.elapsed < 4.5);
  assert.ok(result.peakForce < 1600);
  assert.ok(result.distance > 0);
  assert.equal(result.pedal, false);
});

test('pause freezes physics and releases a held pedal before resume', () => {
  const game = reachTarget();
  game.setPedal(true);
  game.update(0.5);
  game.setPaused(true);
  const before = game.snapshot;
  assert.equal(before.pedal, false);
  game.update(100);
  game.setPedal(true);
  assert.deepEqual(game.snapshot, before);
  game.setPaused(false);
  game.update(0.1);
  close(game.snapshot.force, 485);
  assert.equal(game.snapshot.pedal, false);
});

test('pause also freezes the countdown', () => {
  const game = new BrakeGame();
  game.start();
  game.update(1);
  game.setPaused(true);
  game.update(60);
  close(game.snapshot.countdown, 2);
  game.setPaused(false);
  game.update(2);
  assert.equal(game.snapshot.phase, 'accelerating');
  close(game.snapshot.speed, 0);
});

test('coasting resumes acceleration after all braking force dissipates', () => {
  const game = reachTarget();
  game.setPedal(true);
  game.update(0.1);
  game.setPedal(false);
  game.update(110 / 650);
  close(game.snapshot.force, 0);
  const speed = game.snapshot.speed;
  game.update(0.1);
  close(game.snapshot.speed, speed + 3.1);
  assert.equal(game.snapshot.phase, 'braking');
});

test('without braking speed caps at 200 and timeout occurs at 30 seconds', () => {
  const game = reachTarget();
  game.update(29.999);
  assert.equal(game.snapshot.phase, 'accelerating');
  close(game.snapshot.speed, 200);
  game.update(0.001);
  assert.equal(game.snapshot.failure, 'timeout');
  close(game.snapshot.elapsed, 30);
  close(game.snapshot.distance, (100 + 200) / 2 / 3.6 * (100 / 31)
    + 200 / 3.6 * (30 - 100 / 31));
});

test('large frames cross countdown, 100 km/h, speed cap, and timeout correctly', () => {
  const game = new BrakeGame();
  game.start();
  game.update(Number.MAX_VALUE);
  assert.equal(game.snapshot.failure, 'timeout');
  close(game.snapshot.speed, 200);
  close(game.snapshot.elapsed, 30);
  assert.ok(Number.isFinite(game.snapshot.travel));
});

test('analytical integration has the same result across different frame sizes', () => {
  const run = (parts) => {
    const game = reachTarget();
    game.update(0.25);
    game.setPedal(true);
    for (let i = 0; i < parts; i++) game.update(1 / parts);
    game.setPedal(false);
    for (let i = 0; i < parts; i++) game.update(1.5 / parts);
    return game.snapshot;
  };
  const whole = run(1);
  const frames = run(240);
  for (const key of ['speed', 'force', 'elapsed', 'reaction', 'distance', 'travel', 'peakForce']) {
    close(frames[key], whole[key]);
  }
  assert.equal(frames.phase, whole.phase);
});

test('invalid time values are ignored and reset returns a fresh idle state', () => {
  const game = reachTarget();
  const before = game.snapshot;
  for (const dt of [NaN, Infinity, -Infinity, -1, 0, '1']) game.update(dt);
  assert.deepEqual(game.snapshot, before);
  game.setPedal(true);
  game.update(1);
  game.setPaused(true);
  game.reset();
  assert.deepEqual(game.snapshot, new BrakeGame().snapshot);
  const copy = game.snapshot;
  copy.speed = 500;
  assert.equal(game.snapshot.speed, 0);
  game.start();
  assert.equal(game.snapshot.phase, 'countdown');
  assert.equal(game.snapshot.paused, false);
});
