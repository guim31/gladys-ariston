import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig, refreshMs } from '../src/config.js';

test('an empty configuration gets the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.equal(isConfigured(normalizeConfig()), false);
  assert.equal(refreshMs(normalizeConfig()), 5 * 60 * 1000);
});

test('values arriving as strings are typed, unknown ones fall back on the default', () => {
  const config = normalizeConfig({
    username: '  someone@example.com ',
    password: 'x',
    language: 'it',
    refresh_minutes: 1,
    faults: 'false',
    energy: 'true',
  });
  assert.equal(config.username, 'someone@example.com');
  assert.equal(config.language, 'fr');
  assert.equal(config.refresh_minutes, '5', 'faster than 3 minutes is refused');
  assert.equal(config.faults, false);
  assert.equal(config.energy, true);
  assert.equal(isConfigured(config), true);
  assert.equal(refreshMs(normalizeConfig({ refresh_minutes: 30 })), 30 * 60 * 1000);
});
