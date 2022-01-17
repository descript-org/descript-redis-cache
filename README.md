# descript-redis-cache
Plugin to use Redis as a cache for responses in Descript

## Usage

```js
const de = require('descript');
const deRedisCache = require('descript-redis-cache');

const context = new de.Context(req, res, {
    cache: new deMemcached(myCacheConfig, logger)
});
```

## Config

```js
{
    defaultKeyTTL: 60 * 60 * 24, // key ttl in seconds
    generation: 1, // increment generation to invalidate all key across breaking changes releases
    readTimeout: 100, // read timeout in milliseconds,
    redisOptions: {}, // @see https://github.com/luin/ioredis/blob/master/API.md#new-redisport-host-options
}
```

## Logger

Optionally you can pass logger object in the constructor. It should implement standard `Console` methods.
