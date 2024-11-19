# descript-redis-cache
Plugin to use Redis as a cache in Descript

## Usage

```js
import de from 'descript';
import deRedisCache from 'descript-redis-cache';

const redisCache = new deRedisCache(options);

const myBlock = de.http({
    block: { /* ... */ },
    options: {
        key: ({ params }) => '_some_cache_key_from_params_',
        cache: deRedisCache,
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
    redis: (
        { startupNodes: ClusterNode[], options?: ClusterOptions } |
        { options: RedisOptions }
    );
}
```

## Logger

Optionally you can pass logger object in the constructor. It should implement standard `Console` methods.

```js
const redisCache = new deRedisCache(options, logger);
```
