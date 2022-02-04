'use strict';

const contimer = require('contimer');
const crypto = require('crypto');
const de = require('descript');
const Redis = require('ioredis');

class DescriptRedisCache {

    constructor(options, logger) {
        this._options = Object.assign({
            clusterNodes: [],
            defaultKeyTTL: 60 * 60 * 24, // key ttl in seconds
            generation: 1, // increment generation to invalidate all key across breaking changes releases
            readTimeout: 100, // read timeout in milliseconds,
            redisOptions: {},
            useCluster: false,
        }, options);

        this._logger = logger;

        if (this._options.useCluster) {
            this._client = new Redis.Cluster(this._options.clusterNodes, this._options.redisOptions);
        } else {
            this._client = new Redis(this._options.redisOptions);
        }

        const optionsToLog = Object.assign({}, this._options);
        // Don't write connection options to log because it can contain password
        // (not only as a property, but as a part of a connection string, so it's difficult to delete only a password)
        delete optionsToLog.redisOptions;

        this._log({
            type: DescriptRedisCache.EVENT.REDIS_CACHE_INITIALIZED,
            options: optionsToLog,
        });
    }

    getClient() {
        return this._client;
    }

    get({ key, context }) {
        const normalizedKey = this.normalizeKey(key);

        return new Promise((resolve, reject) => {
            this._log({
                type: DescriptRedisCache.EVENT.REDIS_CACHE_READ_START,
                key,
                normalizedKey,
            }, context);

            const networkTimerStop = contimer.start({}, 'descript-redis-cache.get.network');
            const totalTimerStop = contimer.start({}, 'descript-redis-cache.get.total');

            let isTimeout = false;

            const timer = setTimeout(() => {
                isTimeout = true;

                const networkTimer = networkTimerStop();
                const totalTimer = totalTimerStop();

                this._log({
                    type: DescriptRedisCache.EVENT.REDIS_CACHE_READ_TIMEOUT,
                    key,
                    normalizedKey,
                    timers: {
                        network: networkTimer,
                        total: totalTimer,
                    },
                }, context);

                reject(de.error({
                    id: DescriptRedisCache.EVENT.REDIS_CACHE_READ_TIMEOUT,
                }));
            }, this._options.readTimeout);

            this._client.get(normalizedKey, (error, data) => {
                if (isTimeout) {
                    return;
                }

                const networkTimer = networkTimerStop();
                clearTimeout(timer);

                if (error) {
                    const totalTimer = totalTimerStop();
                    this._log({
                        type: DescriptRedisCache.EVENT.REDIS_CACHE_READ_ERROR,
                        error,
                        key,
                        normalizedKey,
                        timers: {
                            network: networkTimer,
                            total: totalTimer,
                        },
                    }, context);

                    reject(de.error({
                        id: DescriptRedisCache.EVENT.REDIS_CACHE_READ_ERROR,
                    }));
                } else if (!data) {
                    const totalTimer = totalTimerStop();
                    this._log({
                        type: DescriptRedisCache.EVENT.REDIS_CACHE_READ_KEY_NOT_FOUND,
                        key,
                        normalizedKey,
                        timers: {
                            network: networkTimer,
                            total: totalTimer,
                        },
                    }, context);

                    reject(de.error({
                        id: DescriptRedisCache.EVENT.REDIS_CACHE_READ_KEY_NOT_FOUND,
                    }));
                } else {
                    let parsedValue;
                    try {
                        parsedValue = JSON.parse(data);
                    } catch (error) {
                        const totalTimer = totalTimerStop();
                        this._log({
                            type: DescriptRedisCache.EVENT.REDIS_CACHE_JSON_PARSING_FAILED,
                            data,
                            error,
                            key,
                            normalizedKey,
                            timers: {
                                network: networkTimer,
                                total: totalTimer,
                            },
                        }, context);

                        reject(de.error({
                            id: DescriptRedisCache.EVENT.REDIS_CACHE_JSON_PARSING_FAILED,
                        }));
                        return;
                    }

                    const totalTimer = totalTimerStop();
                    this._log({
                        type: DescriptRedisCache.EVENT.REDIS_CACHE_READ_DONE,
                        data,
                        key,
                        normalizedKey,
                        timers: {
                            network: networkTimer,
                            total: totalTimer,
                        },
                    }, context);

                    resolve(parsedValue);
                }
            });
        });
    }

    set({ key, value, maxage = this._options.defaultKeyTTL, context } ) {
        if (typeof value === 'undefined') {
            return;
        }

        const totalTimerStop = contimer.start({}, 'descript-redis-cache.set.total');
        const normalizedKey = this.normalizeKey(key);

        return new Promise((resolve, reject) => {
            this._log({
                type: DescriptRedisCache.EVENT.REDIS_CACHE_WRITE_START,
                key,
                normalizedKey,
            }, context);

            // save to cache only serializable data
            const safeSerializableValue = {
                status_code: value.status_code,
                headers: value.headers,
                result: value.result,
            };

            let json;
            try {
                json = JSON.stringify(safeSerializableValue);
            } catch (error) {
                const totalTimer = totalTimerStop();
                this._log({
                    type: DescriptRedisCache.EVENT.REDIS_CACHE_JSON_STRINGIFY_FAILED,
                    data: value,
                    error,
                    key,
                    normalizedKey,
                    timers: {
                        network: {},
                        total: totalTimer,
                    },
                }, context);
                reject(de.error({
                    id: DescriptRedisCache.EVENT.REDIS_CACHE_JSON_STRINGIFY_FAILED,
                }));
                return;
            }

            const networkTimerStop = contimer.start({}, 'descript-redis-cache.set.network');
            // maxage - seconds
            this._client.set(normalizedKey, json, 'EX', maxage, (error, done) => {
                const networkTimer = networkTimerStop();
                const totalTimer = totalTimerStop();
                if (error) {
                    this._log({
                        type: DescriptRedisCache.EVENT.REDIS_CACHE_WRITE_ERROR,
                        error,
                        key,
                        normalizedKey,
                        timers: {
                            network: networkTimer,
                            total: totalTimer,
                        },
                    }, context);
                    reject(de.error({
                        id: DescriptRedisCache.EVENT.REDIS_CACHE_WRITE_ERROR,
                    }));
                } else if (!done) {
                    this._log({
                        type: DescriptRedisCache.EVENT.REDIS_CACHE_WRITE_FAILED,
                        key,
                        normalizedKey,
                        timers: {
                            network: networkTimer,
                            total: totalTimer,
                        },
                    }, context);
                    reject(de.error({
                        id: DescriptRedisCache.EVENT.REDIS_CACHE_WRITE_FAILED,
                    }));
                } else {
                    this._log({
                        type: DescriptRedisCache.EVENT.REDIS_CACHE_WRITE_DONE,
                        data: json,
                        key,
                        normalizedKey,
                        timers: {
                            network: networkTimer,
                            total: totalTimer,
                        },
                    }, context);
                    resolve();
                }
            });
        });
    }

    /**
     * Generates normalized SHA-512 key with generation
     * @param {string} key
     * @returns {string}
     */
    normalizeKey(key) {
        const value = `g${ this._options.generation }:${ key }`;
        return crypto
            .createHash('sha512')
            .update(value, 'utf8')
            .digest('hex');
    }

    _log(event, context) {
        if (this._logger) {
            this._logger.log(event, context);
        }
    }
}

DescriptRedisCache.EVENT = {
    REDIS_CACHE_INITIALIZED: 'REDIS_CACHE_INITIALIZED',

    REDIS_CACHE_JSON_PARSING_FAILED: 'REDIS_CACHE_JSON_PARSING_FAILED',
    REDIS_CACHE_JSON_STRINGIFY_FAILED: 'REDIS_CACHE_JSON_STRINGIFY_FAILED',

    REDIS_CACHE_READ_DONE: 'REDIS_CACHE_READ_DONE',
    REDIS_CACHE_READ_ERROR: 'REDIS_CACHE_READ_ERROR',
    REDIS_CACHE_READ_KEY_NOT_FOUND: 'REDIS_CACHE_READ_KEY_NOT_FOUND',
    REDIS_CACHE_READ_START: 'REDIS_CACHE_READ_START',
    REDIS_CACHE_READ_TIMEOUT: 'REDIS_CACHE_READ_TIMEOUT',

    REDIS_CACHE_WRITE_DONE: 'REDIS_CACHE_WRITE_DONE',
    REDIS_CACHE_WRITE_ERROR: 'REDIS_CACHE_WRITE_ERROR',
    REDIS_CACHE_WRITE_FAILED: 'REDIS_CACHE_WRITE_FAILED',
    REDIS_CACHE_WRITE_START: 'REDIS_CACHE_READ_START',
};

module.exports = DescriptRedisCache;
