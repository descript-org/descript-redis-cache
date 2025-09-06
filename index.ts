import { hash } from 'node:crypto';
import type { CacheInterface, LoggerInterface } from 'descript';
import { error as deError } from 'descript';
import type { ClusterNode, ClusterOptions, RedisOptions } from 'ioredis';
import { Cluster, Redis } from 'ioredis';

export interface Options {
    /** key TTL in seconds (default: 60 * 60 * 24) */
    defaultKeyTTL?: number;
    /** increment generation to invalidate all key across breaking changes releases (default: 1) */
    generation?: number;
    /** read timeout in milliseconds (default: 100) */
    readTimeout?: number;
    /** use two clients (reader and writer) with Sentinel (default: false) */
    useReaderAndWriterWithSentinel?: boolean;
    /** redis config */
    redis: RedisOptions | { startupNodes: ClusterNode[], options?: ClusterOptions };
}

interface InnerOptions extends Options {
    defaultKeyTTL: number;
    generation: number;
    readTimeout: number;
}

type Logger = LoggerInterface<LoggerEvent>;

interface Timers {
    start: number;
    end: number;
}

export type LoggerEvent = (
    {
        'type': EVENT.REDIS_CACHE_INITIALIZED;
        options: Options
    } |
    {
        'type': EVENT.REDIS_CACHE_READ_START;
        key: string;
        normalizedKey: string
    } |
    {
        'type': EVENT.REDIS_CACHE_READ_KEY_NOT_FOUND;
        key: string;
        normalizedKey: string;
        timers: Timers
    } |
    {
        'type': EVENT.REDIS_CACHE_READ_TIMEOUT;
        key: string;
        normalizedKey: string;
        timers: Timers
    } |
    {
        'type': EVENT.REDIS_CACHE_READ_ERROR;
        error: Error;
        key: string;
        normalizedKey: string;
        timers: Timers
    } |
    {
        'type': EVENT.REDIS_CACHE_JSON_PARSING_FAILED;
        data: unknown;
        error: unknown;
        key: string;
        normalizedKey: string;
        timers: Timers
    } |
    {
        'type': EVENT.REDIS_CACHE_READ_DONE;
        data: unknown;
        key: string;
        normalizedKey: string;
        timers: Timers
    } |
    {
        'type': EVENT.REDIS_CACHE_WRITE_START;
        key: string;
        normalizedKey: string
    } |
    {
        'type': EVENT.REDIS_CACHE_JSON_STRINGIFY_FAILED;
        data: unknown;
        error: unknown;
        key: string;
        normalizedKey: string;
        timers: Timers
    } |
    {
        'type': EVENT.REDIS_CACHE_WRITE_ERROR;
        error: Error;
        key: string;
        normalizedKey: string;
        timers: Timers
    } |
    {
        'type': EVENT.REDIS_CACHE_WRITE_FAILED;
        key: string;
        normalizedKey: string;
        timers: Timers
    } |
    {
        'type': EVENT.REDIS_CACHE_WRITE_DONE;
        data: string;
        key: string;
        normalizedKey: string;
        timers: Timers
    }
);

export class Cache<Result> implements CacheInterface<Result> {
    #writer: Cluster | Redis;
    #reader: Cluster | Redis;
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
            this.#reader = new Cluster(
                this.#options.redis.startupNodes,
                this.#options.redis.options,
            );
            this.#writer = this.#reader;
        } else {
            if (this.#options.useReaderAndWriterWithSentinel) {
                // Client for write (always on master)
                this.#writer = new Redis({
                    ...this.#options.redis,
                    role: 'master',
                });

                // Client for read (replica, only read-only commands)
                this.#reader = new Redis({
                    ...this.#options.redis,
                    role: 'slave',
                    readOnly: true,
                });
            } else {
                this.#reader = new Redis(this.#options.redis);
                this.#writer = this.#reader;
            }

        }

        this.#log({
            'type': EVENT.REDIS_CACHE_INITIALIZED,
            options: { ...this.#options },
        });
    }

    getClient() {
        return {
            reader: this.#reader,
            writer: this.#writer,
        };
    }

    get({ key }: { key: string }): Promise<Result | undefined> {
        const normalizedKey = this.#normalizeKey(key);

        return new Promise((resolve, reject) => {
            this.#log({
                'type': EVENT.REDIS_CACHE_READ_START,
                key,
                normalizedKey,
            });

            const start = Date.now();
            let isTimeout = false;

            const timer = setTimeout(() => {
                isTimeout = true;

                this.#log({
                    'type': EVENT.REDIS_CACHE_READ_TIMEOUT,
                    key,
                    normalizedKey,
                    timers: {
                        start,
                        end: Date.now(),
                    },
                });

                reject(deError({
                    id: EVENT.REDIS_CACHE_READ_TIMEOUT,
                }));
            }, this.#options.readTimeout);

            this.#reader.get(normalizedKey, (error, data) => {
                if (isTimeout) {
                    return;
                }

                clearTimeout(timer);

                if (error) {
                    this.#log({
                        'type': EVENT.REDIS_CACHE_READ_ERROR,
                        error,
                        key,
                        normalizedKey,
                        timers: {
                            start,
                            end: Date.now(),
                        },
                    });

                    reject(deError({
                        id: EVENT.REDIS_CACHE_READ_ERROR,
                    }));
                } else if (!data) {
                    this.#log({
                        'type': EVENT.REDIS_CACHE_READ_KEY_NOT_FOUND,
                        key,
                        normalizedKey,
                        timers: {
                            start,
                            end: Date.now(),
                        },
                    });

                    reject(deError({
                        id: EVENT.REDIS_CACHE_READ_KEY_NOT_FOUND,
                    }));
                } else {
                    let parsedValue;
                    try {
                        parsedValue = JSON.parse(data);
                    } catch (error) {
                        this.#log({
                            'type': EVENT.REDIS_CACHE_JSON_PARSING_FAILED,
                            data,
                            error,
                            key,
                            normalizedKey,
                            timers: {
                                start,
                                end: Date.now(),
                            },
                        });

                        reject(deError({
                            id: EVENT.REDIS_CACHE_JSON_PARSING_FAILED,
                        }));
                        return;
                    }

                    this.#log({
                        'type': EVENT.REDIS_CACHE_READ_DONE,
                        data,
                        key,
                        normalizedKey,
                        timers: {
                            start,
                            end: Date.now(),
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

        const start = Date.now();
        const normalizedKey = this.#normalizeKey(key);

        return new Promise<void>((resolve, reject) => {
            this.#log({
                'type': EVENT.REDIS_CACHE_WRITE_START,
                key,
                normalizedKey,
            });

            let json;
            try {
                json = JSON.stringify(value);
            } catch (error) {
                this.#log({
                    'type': EVENT.REDIS_CACHE_JSON_STRINGIFY_FAILED,
                    data: value,
                    error,
                    key,
                    normalizedKey,
                    timers: {
                        start,
                        end: Date.now(),
                    },
                });
                reject(deError({
                    id: EVENT.REDIS_CACHE_JSON_STRINGIFY_FAILED,
                }));
                return;
            }

            // maxage - seconds
            this.#writer.set(normalizedKey, json, 'EX', maxage, (error, done) => {
                if (error) {
                    this.#log({
                        'type': EVENT.REDIS_CACHE_WRITE_ERROR,
                        error,
                        key,
                        normalizedKey,
                        timers: {
                            start,
                            end: Date.now(),
                        },
                    });
                    reject(deError({
                        id: EVENT.REDIS_CACHE_WRITE_ERROR,
                    }));
                } else if (!done) {
                    this.#log({
                        'type': EVENT.REDIS_CACHE_WRITE_FAILED,
                        key,
                        normalizedKey,
                        timers: {
                            start,
                            end: Date.now(),
                        },
                    });
                    reject(deError({
                        id: EVENT.REDIS_CACHE_WRITE_FAILED,
                    }));
                } else {
                    this.#log({
                        'type': EVENT.REDIS_CACHE_WRITE_DONE,
                        data: json,
                        key,
                        normalizedKey,
                        timers: {
                            start,
                            end: Date.now(),
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
