import { hash } from 'node:crypto';
import type { CacheInterface } from 'descript';
import de from 'descript';
import type { ClusterNode, ClusterOptions, RedisOptions } from 'ioredis';
import { Cluster, Redis } from 'ioredis';

export interface Options {
    // key TTL in seconds (default: 60 * 60 * 24)
    defaultKeyTTL?: number;
    // increment generation to invalidate all key across breaking changes releases (default: 1)
    generation?: number;
    // read timeout in milliseconds (default: 100)
    readTimeout?: number;
    redis: RedisOptions | { startupNodes: ClusterNode[], options?: ClusterOptions };
}

interface InnerOptions extends Options {
    defaultKeyTTL: number;
    generation: number;
    readTimeout: number;
}

interface Logger {
    log(event: LoggerEvent): void;
}

export type LoggerEvent = (
    {
        type: EVENT.REDIS_CACHE_INITIALIZED;
        options: Options
    } |
    {
        type: EVENT.REDIS_CACHE_ERROR;
        error: Error;
    } |
    {
        type: EVENT.REDIS_CACHE_READ_START;
        key: string;
        normalizedKey: string
    } |
    {
        type: EVENT.REDIS_CACHE_READ_KEY_NOT_FOUND;
        key: string;
        normalizedKey: string;
        timers: {
            network: [number, number];
            total: [number, number];
        }
    } |
    {
        type: EVENT.REDIS_CACHE_READ_TIMEOUT;
        key: string;
        normalizedKey: string;
        timers: {
            network: [number, number];
            total: [number, number];
        }
    } |
    {
        type: EVENT.REDIS_CACHE_READ_ERROR;
        error: Error;
        key: string;
        normalizedKey: string;
        timers: {
            network: [number, number];
            total: [number, number];
        }
    } |
    {
        type: EVENT.REDIS_CACHE_JSON_PARSING_FAILED;
        data: unknown;
        error: unknown;
        key: string;
        normalizedKey: string;
        timers: {
            network: [number, number];
            total: [number, number];
        }
    } |
    {
        type: EVENT.REDIS_CACHE_READ_DONE;
        data: unknown;
        key: string;
        normalizedKey: string;
        timers: {
            network: [number, number];
            total: [number, number];
        }
    } |
    {
        type: EVENT.REDIS_CACHE_WRITE_START;
        key: string;
        normalizedKey: string
    } |
    {
        type: EVENT.REDIS_CACHE_JSON_STRINGIFY_FAILED;
        data: unknown;
        error: unknown;
        key: string;
        normalizedKey: string;
        timers: {
            total: [number, number];
        }
    } |
    {
        type: EVENT.REDIS_CACHE_WRITE_ERROR;
        error: unknown;
        key: string;
        normalizedKey: string;
        timers: {
            network: [number, number];
            total: [number, number];
        }
    } |
    {
        type: EVENT.REDIS_CACHE_WRITE_FAILED;
        key: string;
        normalizedKey: string;
        timers: {
            network: [number, number];
            total: [number, number];
        }
    } |
    {
        type: EVENT.REDIS_CACHE_WRITE_DONE;
        data: string;
        key: string;
        normalizedKey: string;
        timers: {
            network: [number, number];
            total: [number, number];
        }
    }
);

export class Cache<Result> implements CacheInterface<Result> {
    #client: Cluster | Redis;
    #logger?: Logger;
    #options: InnerOptions;

    constructor(options: Options, logger?: Logger) {
        this.#options = {
            defaultKeyTTL: 60 * 60 * 24,
            generation: 1,
            readTimeout: 100,
            ...options,
        };

        this.#logger = logger;

        if ('startupNodes' in this.#options.redis) {
            this.#client = new Cluster(
                this.#options.redis.startupNodes,
                this.#options.redis.options,
            );
        } else {
            this.#client = new Redis(this.#options.redis);
        }

        this.#log({
            type: EVENT.REDIS_CACHE_INITIALIZED,
            options: { ...this.#options },
        });
    }

    getClient() {
        return this.#client;
    }

    get({ key }: { key: string }): Promise<Result | undefined> {
        const normalizedKey = this.#normalizeKey(key);

        return new Promise((resolve, reject) => {
            this.#log({
                type: EVENT.REDIS_CACHE_READ_START,
                key,
                normalizedKey,
            });

            const networkTimerStart = process.hrtime();
            const totalTimerStart = process.hrtime();

            let isTimeout = false;

            const timer = setTimeout(() => {
                isTimeout = true;

                const networkTimer = process.hrtime(networkTimerStart);
                const totalTimer = process.hrtime(totalTimerStart);

                this.#log({
                    type: EVENT.REDIS_CACHE_READ_TIMEOUT,
                    key,
                    normalizedKey,
                    timers: {
                        network: networkTimer,
                        total: totalTimer,
                    },
                });

                reject(de.error({
                    id: EVENT.REDIS_CACHE_READ_TIMEOUT,
                }));
            }, this.#options.readTimeout);

            this.#client.get(normalizedKey, (error, data) => {
                if (isTimeout) {
                    return;
                }

                const networkTimer = process.hrtime(networkTimerStart);
                clearTimeout(timer);

                if (error) {
                    const totalTimer = process.hrtime(totalTimerStart);
                    this.#log({
                        type: EVENT.REDIS_CACHE_READ_ERROR,
                        error,
                        key,
                        normalizedKey,
                        timers: {
                            network: networkTimer,
                            total: totalTimer,
                        },
                    });

                    reject(de.error({
                        id: EVENT.REDIS_CACHE_READ_ERROR,
                    }));
                } else if (!data) {
                    const totalTimer = process.hrtime(totalTimerStart);
                    this.#log({
                        type: EVENT.REDIS_CACHE_READ_KEY_NOT_FOUND,
                        key,
                        normalizedKey,
                        timers: {
                            network: networkTimer,
                            total: totalTimer,
                        },
                    });

                    reject(de.error({
                        id: EVENT.REDIS_CACHE_READ_KEY_NOT_FOUND,
                    }));
                } else {
                    let parsedValue;
                    try {
                        parsedValue = JSON.parse(data);
                    } catch (error) {
                        const totalTimer = process.hrtime(totalTimerStart);
                        this.#log({
                            type: EVENT.REDIS_CACHE_JSON_PARSING_FAILED,
                            data,
                            error,
                            key,
                            normalizedKey,
                            timers: {
                                network: networkTimer,
                                total: totalTimer,
                            },
                        });

                        reject(de.error({
                            id: EVENT.REDIS_CACHE_JSON_PARSING_FAILED,
                        }));
                        return;
                    }

                    const totalTimer = process.hrtime(totalTimerStart);
                    this.#log({
                        type: EVENT.REDIS_CACHE_READ_DONE,
                        data,
                        key,
                        normalizedKey,
                        timers: {
                            network: networkTimer,
                            total: totalTimer,
                        },
                    });

                    resolve(parsedValue);
                }
            });
        });
    }

    set({ key, value, maxage = this.#options.defaultKeyTTL }: { key: string; value: unknown; maxage?: number } ) {
        if (typeof value === 'undefined') {
            return Promise.resolve();
        }

        const totalTimerStart = process.hrtime();
        const normalizedKey = this.#normalizeKey(key);

        return new Promise<void>((resolve, reject) => {
            this.#log({
                type: EVENT.REDIS_CACHE_WRITE_START,
                key,
                normalizedKey,
            });

            let json;
            try {
                json = JSON.stringify(value);
            } catch (error) {
                const totalTimer = process.hrtime(totalTimerStart);
                this.#log({
                    type: EVENT.REDIS_CACHE_JSON_STRINGIFY_FAILED,
                    data: value,
                    error,
                    key,
                    normalizedKey,
                    timers: {
                        total: totalTimer,
                    },
                });
                reject(de.error({
                    id: EVENT.REDIS_CACHE_JSON_STRINGIFY_FAILED,
                }));
                return;
            }

            const networkTimerStart = process.hrtime();
            // maxage - seconds
            this.#client.set(normalizedKey, json, 'EX', maxage, (error, done) => {
                const networkTimer = process.hrtime(networkTimerStart);
                const totalTimer = process.hrtime(totalTimerStart);
                if (error) {
                    this.#log({
                        type: EVENT.REDIS_CACHE_WRITE_ERROR,
                        error,
                        key,
                        normalizedKey,
                        timers: {
                            network: networkTimer,
                            total: totalTimer,
                        },
                    });
                    reject(de.error({
                        id: EVENT.REDIS_CACHE_WRITE_ERROR,
                    }));
                } else if (!done) {
                    this.#log({
                        type: EVENT.REDIS_CACHE_WRITE_FAILED,
                        key,
                        normalizedKey,
                        timers: {
                            network: networkTimer,
                            total: totalTimer,
                        },
                    });
                    reject(de.error({
                        id: EVENT.REDIS_CACHE_WRITE_FAILED,
                    }));
                } else {
                    this.#log({
                        type: EVENT.REDIS_CACHE_WRITE_DONE,
                        data: json,
                        key,
                        normalizedKey,
                        timers: {
                            network: networkTimer,
                            total: totalTimer,
                        },
                    });
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
    #normalizeKey(key: string) {
        const value = `g${ this.#options.generation }:${ key }`;
        return hash('sha512', value);
    }

    #log(event: LoggerEvent) {
        if (this.#logger) {
            this.#logger.log(event);
        }
    }
}

export enum EVENT {
    REDIS_CACHE_INITIALIZED= 'REDIS_CACHE_INITIALIZED',
    REDIS_CACHE_ERROR= 'REDIS_CACHE_ERROR',

    REDIS_CACHE_JSON_PARSING_FAILED = 'REDIS_CACHE_JSON_PARSING_FAILED',
    REDIS_CACHE_JSON_STRINGIFY_FAILED = 'REDIS_CACHE_JSON_STRINGIFY_FAILED',

    REDIS_CACHE_READ_DONE = 'REDIS_CACHE_READ_DONE',
    REDIS_CACHE_READ_ERROR = 'REDIS_CACHE_READ_ERROR',
    REDIS_CACHE_READ_KEY_NOT_FOUND = 'REDIS_CACHE_READ_KEY_NOT_FOUND',
    REDIS_CACHE_READ_START = 'REDIS_CACHE_READ_START',
    REDIS_CACHE_READ_TIMEOUT = 'REDIS_CACHE_READ_TIMEOUT',

    REDIS_CACHE_WRITE_DONE = 'REDIS_CACHE_WRITE_DONE',
    REDIS_CACHE_WRITE_ERROR = 'REDIS_CACHE_WRITE_ERROR',
    REDIS_CACHE_WRITE_FAILED = 'REDIS_CACHE_WRITE_FAILED',
    REDIS_CACHE_WRITE_START = 'REDIS_CACHE_WRITE_START',
}
