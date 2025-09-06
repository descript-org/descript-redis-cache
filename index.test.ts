import { createServer } from 'node:http';
import * as de from 'descript';
import { createSentinel } from '@redis/client';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Cache } from './index';
import type { Server } from 'http';

vi.mock('@redis/client', () => {
    const createSentinel = vi.fn(() => {
        return {
            'get': vi.fn().mockResolvedValue(undefined),
            'set': vi.fn().mockResolvedValue(undefined),
            on() { return this;},
            connect() {return this;},
        };
    });
    return {
        createSentinel,
    };
});

let redisGet: Mock;
let redisSet: Mock;
let cache: Cache<never>;
let server: Server;
beforeEach(() => {
    const client = createSentinel({
        name: 'sentinel-db',
        sentinelRootNodes: [{
            host: 'example',
            port: 1234,
        }],
        masterPoolSize: 10,
        replicaPoolSize: 10,
    });

    redisGet = client.get as Mock;
    redisSet = client.set as Mock;

    cache = new Cache<never>({
        client,
    });

    server = createServer((req, res) => {
        res.statusCode = 200;
        res.setHeader('date', new Date(0).toUTCString());
        res.end('some http value');
    });
    server.listen(8080);

    redisGet.mockReset();
    redisSet.mockReset();
});

afterEach(() => {
    server.close();
});

it('de.func', async() => {
    const block = de.func({
        block: () => {
            return Promise.resolve('somevalue');
        },
        options: {
            key: () => 'somekey',
            cache,
        },
    });

    await de.run(block);

    expect(redisGet).toHaveBeenCalledOnce();
    expect(redisGet).toHaveBeenCalledWith(
        'e33d0afae8e08752efa1a467653931ae9ba60c6a3ea693e684a6a56ef3b18ba3c7e711edee33f99471d9bb2d02302e92512cc3c8513ab473bbe71d52b8f7e39a',
    );

    expect(redisSet).toHaveBeenCalledOnce();
    expect(redisSet).toHaveBeenCalledWith(
        'e33d0afae8e08752efa1a467653931ae9ba60c6a3ea693e684a6a56ef3b18ba3c7e711edee33f99471d9bb2d02302e92512cc3c8513ab473bbe71d52b8f7e39a',
        '"somevalue"',
        { expiration: { 'type': 'EX', value: 86400 } },
    );
});

it('de.http', async() => {
    const block = de.http({
        block: {
            hostname: 'localhost',
            port: 8080,
            pathname: '/',
        },
        options: {
            key: () => 'somekey',
            cache,
        },
    });

    await de.run(block);

    expect(redisGet).toHaveBeenCalledOnce();
    expect(redisGet).toHaveBeenCalledWith(
        'e33d0afae8e08752efa1a467653931ae9ba60c6a3ea693e684a6a56ef3b18ba3c7e711edee33f99471d9bb2d02302e92512cc3c8513ab473bbe71d52b8f7e39a',
    );

    expect(redisSet).toHaveBeenCalledOnce();
    expect(redisSet).toHaveBeenCalledWith(
        'e33d0afae8e08752efa1a467653931ae9ba60c6a3ea693e684a6a56ef3b18ba3c7e711edee33f99471d9bb2d02302e92512cc3c8513ab473bbe71d52b8f7e39a',
        '{"statusCode":200,"headers":{"date":"Thu, 01 Jan 1970 00:00:00 GMT","connection":"keep-alive","keep-alive":"timeout=5","content-length":"15"},"result":"some http value"}',
        { expiration: { 'type': 'EX', value: 86400 } },
    );
});
