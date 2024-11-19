import { createServer } from 'node:http';
import de from 'descript';
import { Redis } from 'ioredis';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Cache } from './index';
import type { Server } from 'http';

vi.mock('ioredis', () => {
    const Redis = vi.fn();
    Redis.prototype.get = vi.fn().mockResolvedValue(undefined);
    Redis.prototype.set = vi.fn().mockResolvedValue(undefined);
    return {
        Redis,
    };
});

const redisGet = Redis.prototype.get as Mock;
const redisSet = Redis.prototype.set as Mock;

let cache: Cache<never>;
let server: Server;
beforeEach(() => {
    cache = new Cache<never>({
        redis: {
            options: {},
        },
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
        expect.anything(),
    );

    expect(redisSet).toHaveBeenCalledOnce();
    expect(redisSet).toHaveBeenCalledWith(
        'e33d0afae8e08752efa1a467653931ae9ba60c6a3ea693e684a6a56ef3b18ba3c7e711edee33f99471d9bb2d02302e92512cc3c8513ab473bbe71d52b8f7e39a',
        '"somevalue"',
        'EX',
        86400,
        expect.anything(),
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
        expect.anything(),
    );

    expect(redisSet).toHaveBeenCalledOnce();
    expect(redisSet).toHaveBeenCalledWith(
        'e33d0afae8e08752efa1a467653931ae9ba60c6a3ea693e684a6a56ef3b18ba3c7e711edee33f99471d9bb2d02302e92512cc3c8513ab473bbe71d52b8f7e39a',
        '{"statusCode":200,"headers":{"date":"Thu, 01 Jan 1970 00:00:00 GMT","connection":"keep-alive","keep-alive":"timeout=5","content-length":"15"},"result":"some http value"}',
        'EX',
        86400,
        expect.anything(),
    );
});
