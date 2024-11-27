# descript-redis-cache
Plugin to use Redis as a cache in Descript

## Usage

```js
import de from 'descript';
import { Cache } from 'descript-redis-cache';

const redisCache = new Cache(options);

// subscribe to events if necessary
// @see https://github.com/luin/ioredis#connection-events
redisCache.getClient()
    .on('reconnecting', () => {/* ... */})
    .on('error', () => {/* ... */})
    .on('close', () => {/* ... */})
    .on('end', () => {/* ... */});

const myBlock = de.http({
    block: { /* ... */ },
    options: {
        key: ({ params }) => '_some_cache_key_by_params_',
        cache: redisCache,
    }
});
```

## Options

```ts
import type { ClusterNode, ClusterOptions, RedisOptions } from 'ioredis';

export interface Options {
    // key TTL in seconds (default: 60 * 60 * 24)
    defaultKeyTTL?: number;
    // increment generation to invalidate all key across breaking changes releases (default: 1)
    generation?: number;
    // read timeout in milliseconds (default: 100)
    readTimeout?: number;
    redis: RedisOptions | { startupNodes: ClusterNode[], options?: ClusterOptions };
}
```

## Logger

Optionally you can pass logger object in the constructor. It should implement standard `Console` methods.

```js
const redisCache = new deRedisCache(options, logger);
```
