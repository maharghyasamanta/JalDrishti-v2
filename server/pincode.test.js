import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPincodeService } from './pincode.js';
import { createHandler } from './index.js';
import { mockReq, mockRes } from './testUtils.js';

describe('pincode service and /api/pincode handler', () => {
  test('invalid pin returns 400 from handler and ok:false from service without calling upstream', async () => {
    let calls = 0;
    const pincodeService = createPincodeService({
      fetchImpl: async () => {
        calls++;
        throw new Error('should not be called');
      },
    });

    const svcRes = await pincodeService.lookup('012345');
    assert.deepEqual(svcRes, { pincode: '012345', ok: false });
    assert.equal(calls, 0);

    const handler = createHandler({ getPayload: () => null }, { getPayload: () => null }, { pincodeService });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', url: '/api/pincode?pin=012345' }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.ended, true);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.equal(calls, 0);
  });

  test('valid pin normalises India Post offices and maps legacy state spellings', async () => {
    const pincodeService = createPincodeService({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            Status: 'Success',
            PostOffice: [
              { Name: 'Bhubaneswar GPO', District: 'Khordha', State: 'Orissa' },
              { Name: 'Bapuji Nagar', District: 'Khordha', State: 'Orissa' },
            ],
          },
        ],
      }),
    });

    const handler = createHandler({ getPayload: () => null }, { getPayload: () => null }, { pincodeService });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', url: '/api/pincode?pin=751001' }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.getHeader('Cache-Control'), 'public, max-age=300');
    assert.deepEqual(JSON.parse(res.body), {
      pincode: '751001',
      ok: true,
      district: 'Khordha',
      state: 'Odisha',
      places: [
        { name: 'Bhubaneswar GPO', district: 'Khordha', state: 'Odisha' },
        { name: 'Bapuji Nagar', district: 'Khordha', state: 'Odisha' },
      ],
    });
  });

  test('cache hit makes only one upstream call', async () => {
    let calls = 0;
    let currentTime = 1_000_000;
    const pincodeService = createPincodeService({
      now: () => currentTime,
      fetchImpl: async () => {
        calls++;
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              Status: 'Success',
              PostOffice: [{ Name: 'Guwahati GPO', District: 'Kamrup Metropolitan', State: 'Assam' }],
            },
          ],
        };
      },
    });

    const first = await pincodeService.lookup('781001');
    const second = await pincodeService.lookup('781001');
    assert.equal(first.ok, true);
    assert.deepEqual(first, second);
    assert.equal(calls, 1);

    // After 24h TTL expires, upstream is called again
    currentTime += 24 * 60 * 60 * 1000 + 1;
    const third = await pincodeService.lookup('781001');
    assert.equal(third.ok, true);
    assert.equal(calls, 2);
  });

  test('upstream error returns ok:false with no fake data', async () => {
    const pincodeService = createPincodeService({
      fetchImpl: async () => {
        throw new Error('network down');
      },
    });

    const res = await pincodeService.lookup('400001');
    assert.deepEqual(res, { pincode: '400001', ok: false });
  });

  test('unknown state returns ok:false', async () => {
    const pincodeService = createPincodeService({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            Status: 'Success',
            PostOffice: [{ Name: 'Mystery Office', District: 'UnknownDist', State: 'Atlantis' }],
          },
        ],
      }),
    });

    const res = await pincodeService.lookup('110001');
    assert.deepEqual(res, { pincode: '110001', ok: false });
  });
});
