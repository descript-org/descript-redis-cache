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

| Param         | Type                              | Default        | Description                                                  |
|---------------|-----------------------------------|----------------|--------------------------------------------------------------|
| clusterNodes  | `Array`                           | `[]`           | If you're using a cluster: an array of nodes in the cluster `[{ port: number, host: string }]` |
| defaultKeyTTL | `number`                          | `60 * 60 * 24` | key ttl in seconds                                           |
| generation    | `number`                          | 1              | increment generation to invalidate all key across breaking changes releases |
| readTimeout   | `number`                          | 100            | read timeout in milliseconds                                 |
| redisOptions  | `IRedisOptions` or `IClusterOptions` | `{}`           | Redis constructor [options](https://github.com/luin/ioredis/blob/master/API.md#new-redisport-host-options) or Redis.Cluster constructor [options](https://github.com/luin/ioredis/blob/master/API.md#new-clusterstartupnodes-options) |
| useCluster    | `boolean`                         | false          | to use [Redis.Cluster](#Cluster)                             |


## Logger

Optionally you can pass logger object in the constructor. It should implement standard `Console` methods.

## Cluster
It also has a support for Redis Cluster. In this case you should pass `useCluster = true`, an array of `clusterNodes` and also [clusterOptions](https://github.com/luin/ioredis/blob/a46415187d32bfdc974072403edb8aca2df282d6/lib/cluster/ClusterOptions.ts#L30) in `redisOptions`.
