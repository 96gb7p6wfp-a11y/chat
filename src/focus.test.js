import test from 'node:test';
import assert from 'node:assert/strict';
import {elapsedSeconds, focusStage, formatTimer, normalizeSession} from './focus.js';

test('reminder and reflection activate at their real time boundaries', () => {
  assert.equal(focusStage(1799), 'active');
  assert.equal(focusStage(1800), 'reminder');
  assert.equal(focusStage(3599), 'reminder');
  assert.equal(focusStage(3600), 'reflect');
});

test('elapsed timer survives suspension and respects a stopped session', () => {
  assert.equal(elapsedSeconds({startedAt:1000}, 1801000), 1800);
  assert.equal(elapsedSeconds({startedAt:1000, stoppedAt:61000}, 3601000), 60);
  assert.equal(elapsedSeconds({startedAt:1000}, 500), 0);
});

test('invalid persisted sessions cannot create an invalid timer', () => {
  assert.equal(normalizeSession({startedAt:'yesterday', app:'TikTok'}), null);
  assert.equal(normalizeSession({startedAt:Date.now()+10000, app:'TikTok'}), null);
  assert.equal(normalizeSession({startedAt:Date.now(), app:'unknown'}), null);
  assert.equal(formatTimer(3600), '60:00');
});
