#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probes the real Ariston NET cloud with the integration's own client,
// READ-ONLY, and prints nothing sensitive.
//
//   node scripts/probe.mjs
//       logs in with an invented account and shows how the cloud refuses it
//       (status and error kind): the login path works end to end.
//
//   ARISTON_USERNAME=... ARISTON_PASSWORD=... node scripts/probe.mjs
//       logs in with a real account, lists the appliances, reads each one
//       once (features, data, settings, faults) and prints the SHAPE of the
//       answers: keys, types, item ids — never a value that identifies the
//       account (gateway ids, serial numbers, names, token are masked). Writes
//       nothing to the appliances. About 5 requests per appliance, one second
//       apart: run it once, not in a loop (the cloud blocks busy accounts).
//
// Compare the shapes with test/fixtures/ariston/*.json.
// -----------------------------------------------------------------------------

import { AristonClient } from '../src/ariston/client.js';
import { PLANT_ITEMS, ZONE_ITEMS, classifyPlant } from '../src/ariston/model.js';

const username = process.env.ARISTON_USERNAME ?? 'probe.gladys@example.invalid';
const password = process.env.ARISTON_PASSWORD ?? 'not-a-real-password';
const real = Boolean(process.env.ARISTON_USERNAME && process.env.ARISTON_PASSWORD);

/** Keys and types of a JSON value, values hidden (numbers and booleans kept: no identity). */
function shape(value, depth = 0) {
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [shape(value[0], depth + 1), `(${value.length} entries)`];
  }
  if (value && typeof value === 'object') {
    if (depth > 4) {
      return '{…}';
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, shape(item, depth + 1)]),
    );
  }
  if (typeof value === 'string') {
    return `string(${value.length})`;
  }
  return value === null
    ? 'null'
    : typeof value === 'number' || typeof value === 'boolean'
      ? value
      : typeof value;
}

/** A dataItems answer as "id@zone: value (min..max step)" lines, without identity. */
function items(data) {
  return (data?.items ?? []).map((item) => {
    const range =
      item.min !== undefined ? ` (${item.min}..${item.max} step ${item.step ?? '-'})` : '';
    const options = Array.isArray(item.options) ? ` options=${JSON.stringify(item.options)}` : '';
    return `${item.id}@${item.zone}: ${JSON.stringify(item.value)}${range}${options}`;
  });
}

const print = (title, value) =>
  console.log(
    `\n== ${title}\n${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`,
  );

const client = new AristonClient({ username, password });

if (!real) {
  print('mode', 'invented account: the cloud must refuse the login');
  try {
    await client.login();
    print('UNEXPECTED', 'the invented account was accepted');
    process.exitCode = 1;
  } catch (err) {
    print('refusal', { kind: err.kind, status: err.status ?? null, message: err.message });
    process.exitCode = err.kind === 'auth' ? 0 : 1;
  }
} else {
  try {
    await client.login();
    print('login', 'accepted (token kept in memory only, not printed)');
    const plants = await client.listPlants();
    print(
      'plants',
      plants.map((plant) => shape(plant)),
    );
    let index = 0;
    for (const raw of plants) {
      index += 1;
      const info = classifyPlant(raw);
      const label = `appliance #${index}: sys=${raw.sys} wheType=${raw.wheType ?? '-'} -> ${info.kind}${info.family ? ` (${info.family.key})` : ''}`;
      print(label, '');
      if (info.kind === 'galevo') {
        const features = await client.getPlantFeatures(info.gw);
        print('features', shape(features));
        const data = await client.getPlantData(info.gw, features, PLANT_ITEMS, ZONE_ITEMS);
        print('dataItems', items(data).join('\n'));
      } else if (info.kind === 'water_heater') {
        print(
          'settings',
          shape(await client.getWaterHeaterSettings(info.family.plantData, info.gw)),
        );
        print('data', shape(await client.getWaterHeaterData(info.family.plantData, info.gw)));
      }
      if (info.kind !== 'unsupported') {
        print('faults', shape(await client.getBusErrors(info.gw)));
      }
    }
  } catch (err) {
    print('error', { kind: err.kind, status: err.status ?? null, message: err.message });
    process.exitCode = 1;
  }
}
