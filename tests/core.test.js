'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core.js');

test('campaign contains five stages of five levels', () => {
  assert.equal(S.STAGES.length, 5);
  assert.equal(S.LEVELS.length, 25);
  for (let stage = 0; stage < 5; stage++) assert.equal(S.LEVELS.filter(level => level.stage === stage).length, 5);
});

test('all seeded boards start valid and connected enough to play', () => {
  for (let id = 0; id < 25; id++) {
    const game = new S.Game(id);
    const occupied = new Set();
    for (const p of [...game.snake, ...game.walls, ...game.storms, ...game.portals]) {
      assert.ok(p.x >= 0 && p.x < S.COLS && p.y >= 0 && p.y < S.ROWS, 'entity in bounds for level ' + id);
      const key = S.key(p); assert.ok(!occupied.has(key), 'no overlap in level ' + id); occupied.add(key);
    }
    assert.ok(!occupied.has(S.key(game.dream)), 'dream is free in level ' + id);
  }
});

test('a direction cannot immediately reverse into the body', () => {
  const game = new S.Game(0);
  assert.equal(game.setDirection('left'), false);
  assert.equal(game.setDirection('up'), true);
  game.step();
  assert.deepEqual(game.snake[0], { x: 6, y: 6 });
});

test('collecting the quota wakes the moon', () => {
  const game = new S.Game(0);
  game.walls = []; game.storms = []; game.level.target = 1;
  game.dream = { x: 7, y: 7 };
  game.step();
  assert.equal(game.collected, 1);
  assert.ok(game.moon);
  assert.equal(game.snake.length, 4, 'growth begins on the next step');
  assert.ok(game.drainEvents().some(event => event.type === 'moon'));
});

test('reaching the moon completes with stars based on remaining rest', () => {
  const game = new S.Game(0);
  game.walls = []; game.storms = []; game.dream = { x: -1, y: -1 }; game.moon = { x: 7, y: 7 };
  game.step();
  assert.equal(game.state, 'complete');
  assert.equal(game.result.passed, true);
  assert.equal(game.result.stars, 3);
});

test('three collisions end a dream without corrupting state', () => {
  const game = new S.Game(0);
  game.walls = [{ x: 7, y: 7 }]; game.storms = [];
  for (let i = 0; i < 3; i++) { game.invulnerable = 0; game.step(); }
  assert.equal(game.state, 'failed');
  assert.equal(game.lives, 0);
  assert.equal(game.result.passed, false);
});

test('moon palace portals transport the head', () => {
  const game = new S.Game(20);
  game.walls = []; game.storms = []; game.portals = [{ x: 7, y: 7 }, { x: 18, y: 10 }];
  game.dream = { x: -1, y: -1 }; game.step();
  assert.deepEqual(game.snake[0], { x: 18, y: 10 });
});

test('save validation reconstructs unlocks from completed levels', () => {
  const save = S.validateSave({ version: 1, unlocked: 24, levels: { 0: { stars: 3, score: 200 }, 1: { stars: 1, score: 100 }, 3: { stars: 3, score: 999 } }, sound: false });
  assert.equal(save.unlocked, 2);
  assert.equal(save.levels[3].stars, 3);
  assert.equal(save.sound, false);
});

test('every campaign level can wake and reach its moon', () => {
  for (let id = 0; id < 25; id++) {
    const game = new S.Game(id);
    game.level.target = 1;
    game.walls = []; game.storms = []; game.portals = [];
    game.dream = { x: 7, y: 7 };
    game.step();
    assert.ok(game.moon, 'moon wakes in level ' + id);
    game.snake = [{ x: game.moon.x - 1, y: game.moon.y }];
    game.previousSnake = game.snake.map(point => ({ ...point }));
    game.direction = { x: 1, y: 0 }; game.pending = { x: 1, y: 0 };
    game.step();
    assert.equal(game.state, 'complete', 'level ' + id + ' can complete');
  }
});
