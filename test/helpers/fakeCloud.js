// -----------------------------------------------------------------------------
// An in-memory Ariston NET cloud: a `fetch` serving the fixtures, recording
// every request, applying the writes to its state, and able to answer like
// the real cloud does when things go wrong (429 "blocked for N seconds", 405
// on an expired token, 5xx, refused login).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/ariston/${name}`, import.meta.url), 'utf8'));

export const GW = {
  GENUS: 'A1B2C3D4E5F6',
  NIMBUS: '0F1E2D3C4B5A',
  BSB: 'BB5B5B5B5B01',
  LYDOS_HYBRID: 'C0FFEE000001',
  LUX: 'C0FFEE000002',
  NUOS: 'C0FFEE000003',
  EVO: 'C0FFEE000004',
};

export const ACCOUNT = { username: 'someone@example.com', password: 'Sup3r-Secret-Pa55' };

const VELIS = {
  [GW.LYDOS_HYBRID]: ['sePlantData', 'se-plantdata.json', 'se-plantsettings.json'],
  [GW.LUX]: ['medPlantData', 'med-plantdata-lux.json', 'med-plantsettings.json'],
  [GW.NUOS]: ['slpPlantData', 'slp-plantdata.json', 'slp-plantsettings.json'],
  [GW.EVO]: ['plantData', 'pd-plantdata-evo.json', null],
};

const json = (status, body, headers = {}) =>
  new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/**
 * @param {object} [options]
 * @param {string[]} [options.plants] gateway ids the account holds (default: all)
 */
export function createFakeCloud({ plants = Object.values(GW) } = {}) {
  const state = {
    remotePlants: fixture('remote-plants.json').filter((p) => plants.includes(p.gw)),
    velisPlants: fixture('velis-plants.json').filter((p) => plants.includes(p.gw)),
    features: {
      [GW.GENUS]: fixture('features-genus-one.json'),
      [GW.NIMBUS]: fixture('features-nimbus.json'),
    },
    items: {
      [GW.GENUS]: fixture('dataitems-genus-one.json').items,
      [GW.NIMBUS]: fixture('dataitems-nimbus.json').items,
    },
    velis: Object.fromEntries(Object.entries(VELIS).map(([gw, [, data]]) => [gw, fixture(data)])),
    settings: Object.fromEntries(
      Object.entries(VELIS).map(([gw, [, , settings]]) => [gw, settings ? fixture(settings) : {}]),
    ),
    faults: {},
    energy: {
      [GW.GENUS]: fixture('energy-account.json'),
      [GW.NIMBUS]: fixture('energy-account.json'),
    },
  };

  const cloud = {
    state,
    requests: [],
    logins: 0,
    tokens: new Set(),
    password: ACCOUNT.password,
    /** Next answers forced, in order: { status, body, headers } or a function. */
    queued: [],
    /** Every request fails with this answer while set. */
    down: null,

    /** A data item of a Galevo plant. */
    item(gw, id, zone = 0) {
      return state.items[gw].find((item) => item.id === id && item.zone === zone);
    },

    /** Requests whose path starts with the given prefix. */
    calls(prefix, method) {
      return cloud.requests.filter(
        (request) => request.path.startsWith(prefix) && (!method || request.method === method),
      );
    },

    /** Forgets every token: the next authenticated request gets a 405. */
    expireTokens() {
      cloud.tokens.clear();
    },

    fetch: async (url, init = {}) => {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/^\/api\/v2\//, '') + parsed.search;
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(init.body) : undefined;
      const token = init.headers?.['ar.authToken'];
      cloud.requests.push({ method, path, body, token, headers: init.headers });

      if (cloud.down) {
        if (cloud.down === 'network') {
          throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
        }
        return json(cloud.down.status, cloud.down.body, cloud.down.headers);
      }
      const forced = cloud.queued.shift();
      if (forced) {
        return json(forced.status, forced.body, forced.headers);
      }

      if (path === 'accounts/login') {
        cloud.logins += 1;
        if (body?.usr !== ACCOUNT.username || body?.pwd !== cloud.password) {
          return json(401, { message: 'Invalid credentials' });
        }
        const issued = `token-${cloud.logins}`;
        cloud.tokens.add(issued);
        return json(200, { token: issued });
      }
      if (!cloud.tokens.has(token)) {
        return json(405, { message: 'Invalid token' });
      }
      return route(method, path, body);
    },
  };

  function route(method, path, body) {
    let match;
    if (path === 'remote/plants') {
      return json(200, state.remotePlants);
    }
    if (path === 'velis/plants') {
      return json(200, state.velisPlants);
    }
    if ((match = /^remote\/plants\/([^/]+)\/features$/.exec(path))) {
      return state.features[match[1]] ? json(200, state.features[match[1]]) : json(404);
    }
    if ((match = /^remote\/dataItems\/([^/?]+)\/get\?umsys=si$/.exec(path))) {
      const items = state.items[match[1]];
      if (!items) {
        return json(404);
      }
      const asked = new Set(body.items.map((item) => `${item.id}:${item.zn}`));
      return json(200, {
        items: items.filter((item) => asked.has(`${item.id}:${item.zone}`)),
      });
    }
    if ((match = /^remote\/dataItems\/([^/?]+)\/set\?umsys=si$/.exec(path))) {
      for (const write of body.items) {
        const item = state.items[match[1]].find(
          (candidate) => candidate.id === write.id && candidate.zone === write.zone,
        );
        if (item) {
          item.value = write.value;
        }
      }
      return json(200);
    }
    if ((match = /^remote\/reports\/([^/]+)\/energyAccount$/.exec(path))) {
      return state.energy[match[1]] ? json(200, state.energy[match[1]]) : json(404);
    }
    if ((match = /^busErrors\?gatewayId=([^&]+)&/.exec(path))) {
      return json(200, state.faults[match[1]] ?? []);
    }
    if ((match = /^velis\/([a-zA-Z]+)\/([^/]+)\/plantSettings$/.exec(path))) {
      return json(200, state.settings[match[2]] ?? {});
    }
    if ((match = /^velis\/([a-zA-Z]+)\/([^/]+)$/.exec(path))) {
      return state.velis[match[2]] ? json(200, state.velis[match[2]]) : json(404);
    }
    if (method === 'POST' && (match = /^velis\/([a-zA-Z]+)\/([^/]+)\/([a-zA-Z]+)$/.exec(path))) {
      const data = state.velis[match[2]];
      const action = match[3];
      if (action === 'switch') {
        data.on = body;
      } else if (action === 'mode') {
        data.mode = body.new;
      } else if (action === 'operativeMode') {
        data.opMode = body.new;
      } else if (action === 'temperature') {
        data.reqTemp = body.new;
      } else if (action === 'temperatures') {
        data.comfortTemp = body.new.comfort;
        data.reducedTemp = body.new.reduced;
      }
      return json(200);
    }
    return json(404);
  }

  return cloud;
}
