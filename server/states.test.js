import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStates, findStateNames } from './states.js';

const index = {
  goalpara: ['Assam'],
  'north goa': ['Goa'],
  aurangabad: ['Bihar', 'Maharashtra'],
  pune: ['Maharashtra'],
  kamrup: ['Assam'],
  'lahaul and spiti': ['Himachal Pradesh'],
  bilaspur: ['Chhattisgarh', 'Himachal Pradesh'],
};

test('Goalpara does not match Goa', () => {
  assert.deepEqual(findStateNames('Goalpara').states, []);
  const r = resolveStates(['Goalpara'], index);
  assert.deepEqual(r.states, ['Assam']);
  assert.equal(r.unresolved, false);
});

test('Goa itself still matches as a whole word', () => {
  assert.deepEqual(findStateNames('Heavy rain in Goa today').states, ['Goa']);
});

test('"Aurangabad" alone is unresolved', () => {
  const r = resolveStates(['Aurangabad'], index);
  assert.deepEqual(r.states, []);
  assert.equal(r.unresolved, true);
  assert.deepEqual(r.unresolvedAreas, ['Aurangabad']);
});

test('"Aurangabad, Maharashtra" resolves to Maharashtra', () => {
  const r = resolveStates(['Aurangabad, Maharashtra'], index);
  assert.deepEqual(r.states, ['Maharashtra']);
  assert.equal(r.unresolved, false);
});

test('state named in another area of the same alert disambiguates', () => {
  const r = resolveStates(['Aurangabad', 'Pune, Maharashtra'], index);
  assert.deepEqual(r.states, ['Maharashtra']);
  assert.equal(r.unresolved, false);
});

test('a district resolved to a state does not disambiguate by itself (no guessing)', () => {
  const r = resolveStates(['Pune, Aurangabad'], index);
  assert.deepEqual(r.states, ['Maharashtra']);
  assert.equal(r.unresolved, true);
  assert.deepEqual(r.unresolvedAreas, ['Aurangabad']);
});

test('"Jammu and Kashmir" resolves as one state, never split on "and"', () => {
  const r = resolveStates(['Jammu and Kashmir'], index);
  assert.deepEqual(r.states, ['Jammu and Kashmir']);
  assert.equal(r.unresolved, false);
  assert.deepEqual(resolveStates(['Jammu & Kashmir'], index).states, ['Jammu and Kashmir']);
});

test('long UT names match as one name', () => {
  assert.deepEqual(resolveStates(['Dadra and Nagar Haveli and Daman and Diu'], index).states,
    ['Dadra and Nagar Haveli and Daman and Diu']);
  assert.deepEqual(resolveStates(['Andaman and Nicobar Islands'], index).states, ['Andaman and Nicobar Islands']);
});

test('multi-area alert resolves to several states', () => {
  const r = resolveStates(['Kamrup, Assam', 'Pune', 'Kerala and Tamil Nadu coast'], index);
  assert.deepEqual(r.states, ['Assam', 'Kerala', 'Maharashtra', 'Tamil Nadu']);
  assert.equal(r.unresolved, false);
});

test('multi-word district containing "and" is matched whole', () => {
  assert.deepEqual(resolveStates(['Lahaul and Spiti'], index).states, ['Himachal Pradesh']);
});

test('area with nothing recognisable is reported unresolved, not dropped', () => {
  const r = resolveStates(['Bay of Bengal'], index);
  assert.equal(r.unresolved, true);
  assert.deepEqual(r.states, []);
  assert.deepEqual(r.unresolvedAreas, ['Bay of Bengal']);
});

test('empty input is unresolved', () => {
  assert.equal(resolveStates([], index).unresolved, true);
});
