// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the texts of the code,
// the feature names, and the four documentation files, which must have the
// same sections. German says "du", never the polite "Sie".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import { LABELS, MESSAGES, NAMES, TEXT } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 24,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      // The store schema caps the catalog and widget descriptions, and widget labels.
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(value, `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

test('the configuration offers the four languages, French by default', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  const field = manifest.config_schema.find((entry) => entry.key === 'language');
  assert.deepEqual(
    field.options.map((option) => option.value),
    LANGS,
  );
  assert.equal(field.default, 'fr');
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 35, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the catalog name is the same everywhere and the description fits the card', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const lang of LANGS) {
    const text = manifest.description[lang];
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
    assert.match(text, /Chaffoteaux/, `description.${lang} names Chaffoteaux`);
    assert.match(text, /Elco/, `description.${lang} names Elco`);
  }
});

test('every fixed text of the code has the four languages', () => {
  const longTexts = new Set([
    'notConfigured',
    'loginRefused',
    'noDevice',
    'initFailed',
    'pickDevice',
    'notRead',
  ]);
  const found = Object.entries(TEXT).flatMap(([key, value]) =>
    problems(value, `TEXT.${key}`, longTexts.has(key) ? MAX.message : MAX.short),
  );
  assert.deepEqual(found, []);
});

test('every message built from a value has the four languages', () => {
  const found = [
    ...problems(MESSAGES.rateLimited(66), 'rateLimited', MAX.message),
    ...problems(MESSAGES.unreachable('ECONNREFUSED'), 'unreachable', MAX.message),
    ...problems(
      MESSAGES.connected(['Chaudière', 'Lydos Hybrid'], ['Elco Aerotop']),
      'connected',
      MAX.message,
    ),
    ...problems(MESSAGES.setpointOutOfRange(10, 30), 'setpointOutOfRange', MAX.message),
    ...problems(MESSAGES.modeNotOffered, 'modeNotOffered', MAX.message),
    ...problems(MESSAGES.notReadYet, 'notReadYet', MAX.message),
    ...problems(MESSAGES.unknownDevice, 'unknownDevice', MAX.message),
  ];
  assert.deepEqual(found, []);
});

test('the feature names and option labels exist in every language', () => {
  assert.deepEqual(tableProblems(NAMES, 'NAMES', MAX.featureName), []);
  assert.deepEqual(tableProblems(LABELS, 'LABELS', MAX.featureName), []);
});

test('the four documentation files have the same sections', async () => {
  const headings = {};
  for (const lang of LANGS) {
    const doc = await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8');
    assert.ok(doc.length >= 300, `docs/${lang}.md is too short for the store`);
    headings[lang] = doc.split('\n').filter((line) => /^#{1,3} /.test(line));
    assert.ok(headings[lang].length >= 8, `docs/${lang}.md has too few sections`);
    assert.match(doc, /Ariston Group/, `docs/${lang}.md says it is not affiliated`);
    if (lang === 'de') {
      for (const line of doc.split('\n')) {
        assert.doesNotMatch(line, POLITE_GERMAN, `docs/de.md uses the polite form: ${line}`);
      }
    }
  }
  const shape = (lang) => headings[lang].map((line) => line.match(/^#+/)[0].length);
  for (const lang of LANGS) {
    assert.deepEqual(shape(lang), shape('en'), `docs/${lang}.md sections differ from docs/en.md`);
  }
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Mode', fr: 'Mode', de: 'Modus' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'Mode', fr: 'Mode', de: '', es: 'Modo' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Gerät', 'Ihre Anlage', 'mit Ihrem', 'Ihren', 'Ihrer']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_triggers[0].fields[1].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.scene_triggers[0].fields[1].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});
