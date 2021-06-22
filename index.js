'use strict';

const log = require('./lib/log');
const ServerKiller = require('./lib/server-shutdown');

const defaultSignals = ['SIGTERM'];
const defaultGracePeriodMilliseconds = 5 * 1000;
const environmentGracePeriodMilliseconds = (process.env.SERVER_SHUTDOWN_GRACE_PERIOD_SECONDS
    ? parseInt(process.env.SERVER_SHUTDOWN_GRACE_PERIOD_SECONDS) * 1000 : undefined);


let terminatedBy;


class ServerGracefulShutdown {

    /**
     *
     * @param {net.Server}  server
     * @param {{ signals, gracePeriodMilliseconds, finalizers, delay, killer}} options
     */
    constructor(server, options) {
        options = options || {};

        ServerGracefulShutdown.ensureOptions(options);

        /** {net.Server} */
        this.server = server;

        /** @type {number} delay in milliseconds allowing kubernetes to take service from out of the routing table */
        this.gracePeriodMilliseconds = options.gracePeriodMilliseconds;

        /** @type {number} delay in milliseconds before starting the graceful shutdown sequence */
        this.delay = options.delay;

        /** @type {ServerKiller} delay in milliseconds before starting the graceful shutdown sequence */
        this.killer = options.killer;

        /** @type {function[]} functions to be executed at the end of the graceful sequence */
        this.shutdownFinalizers = [];

        // register finalizers provided per option
        options.finalizers.forEach(this.addFinalizer.bind(this));
    }

    /**
     *
     * @param {function} fn function to be executed on shutdown taking "server" and "callback" arguments and returning an error or undefined
     */
    addFinalizer(fn) {
        if (typeof fn !== 'function') {
            throw new TypeError('a finalizer has to be a function with "server" and "callback" arguments');
        }

        if (fn.name === '' || fn.name === undefined) {
            throw new TypeError('a finalizer has to be a named function');
        }

        let hasADuplicate = this.shutdownFinalizers.some(finalizer => fn.name === finalizer.name);

        if (hasADuplicate === true) {
            log.info('finalizer name "' + fn.name + '" already registered - ignoring finalizer');
            return;
        }

        this.shutdownFinalizers.push(fn);
    }

    /**
     *
     * @returns {function[]} returns registered finalizer functions
     */
    listFinalizers() {
        // return a copy of the finalizer array
        return [].concat(this.shutdownFinalizers);
    }

    terminate(signal, callback) {
        this.killer.gracefulShutdown(this.server, signal, this.listFinalizers(), callback);
    }

    /**
     *
     * @param {{ signals, gracePeriodMilliseconds, finalizers, delay, killer}} options
     */
    static ensureOptions(options) {

        if (typeof options.delay !== 'number') {
            options.delay = 0;
        }

        if (typeof options.gracePeriodMilliseconds !== 'number') {
            options.gracePeriodMilliseconds = defaultGracePeriodMilliseconds;
        } else if (environmentGracePeriodMilliseconds !== undefined) {
            // environment configuration overwrites options
            options.gracePeriodMilliseconds = environmentGracePeriodMilliseconds;
        }

        if (options.finalizers === undefined) {
            options.finalizers = [];
        }

        if (options.finalizers.constructor !== Array) {
            throw new TypeError('finalizers options has to be an array');
        }

        if (options.killer === undefined) {
            options.killer = new ServerKiller({
                gracePeriodMilliseconds: options.gracePeriodMilliseconds,
            });
        }

        if (!(options.killer instanceof ServerKiller)) {
            throw new TypeError('option killer has to be an instance of ServerKiller');
        }

    }
}

/**
 *
 * @param {net.Server} server
 * @param {{signals, gracePeriodMilliseconds, delay, [serverKiller]}} [options]
 * @param {ServerGracefulShutdown} [gracefulShutdown]
 *
 * @returns {ServerGracefulShutdown}
 */
function enable(server, options, gracefulShutdown) {

    if (typeof options === 'function') {
        gracefulShutdown = options;
        options = {};
    }

    if (options === undefined) {
        options = {};
    }

    if (options.signals === undefined) {
        options.signals = defaultSignals;
    }

    if (gracefulShutdown !== undefined && !(gracefulShutdown instanceof ServerGracefulShutdown)) {
        throw new TypeError('provided gracefulShutdown argument is no instance of ServerGracefulShutdown');
    }

    const serv = server.hasOwnProperty('server') ? server.server : server;

    if (serv.hasOwnProperty('shutdown')) {
        throw new Error('server graceful shutdown already enabled');
    }

    gracefulShutdown = gracefulShutdown || new ServerGracefulShutdown(server, options);

    require('http-shutdown')(serv);

    options.signals.forEach(function (signal) {
        process.on(signal, function () {
            if (isTerminated()) {
                log.info('force exit');
                process.exit(128 + 1);
            }

            terminatedBy = signal;

            setTimeout(function () {
                gracefulShutdown.terminate(signal, () => {
                    log.info('ready to die...')
                });
            }, gracefulShutdown.delay);
        });
    });

    return gracefulShutdown;
}

/**
 *
 * @returns {boolean}
 */
function isTerminated() {
    return terminatedBy !== undefined;
}

/**
 *
 * @returns {undefined,string}
 */
function isTerminatedBy() {
    return terminatedBy;
}

module.exports = {
    enable: enable,
    isTerminated: isTerminated,
    isTerminatedBy: isTerminatedBy,
    ServerGracefulShutdown: ServerGracefulShutdown,
    ServerKiller: ServerKiller,
};
