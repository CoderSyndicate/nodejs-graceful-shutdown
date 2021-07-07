'use strict';

const async = require('async');

const log = require('./lib/log');
const ServerKiller = require('./lib/server-shutdown');

const defaultSignals = ['SIGTERM'];
const defaultGracePeriodMilliseconds = 5 * 1000;
const environmentGracePeriodMilliseconds = (process.env.SERVER_SHUTDOWN_GRACE_PERIOD_SECONDS
    ? parseInt(process.env.SERVER_SHUTDOWN_GRACE_PERIOD_SECONDS) * 1000 : undefined);


let terminatedBy;
let readinessCheckTasks;
let checkingReadiness = false;
let isReady = false;


class ServerGracefulShutdown {

    /**
     *
     * @param {net.Server}  server
     * @param {{ signals, gracePeriodMilliseconds, readinessChecks, finalizers, delay, killer}} options
     */
    constructor(server, options) {
        options = options || {};

        ServerGracefulShutdown.ensureOptions(options);

        /** {net.Server} */
        this.server = server;

        /** @type {Number} delay in milliseconds allowing kubernetes to take service from out of the routing table */
        this.gracePeriodMilliseconds = options.gracePeriodMilliseconds;

        /** @type {Number} delay in milliseconds before starting the graceful shutdown sequence */
        this.delay = options.delay;

        /** @type {ServerKiller} delay in milliseconds before starting the graceful shutdown sequence */
        this.killer = options.killer;

        /** @type {Function[]} functions to be executed at the end of the graceful sequence */
        this.shutdownFinalizers = [];

        /** @type {Function[]} functions to be executed at startup to check the readiness */
        this.readinessChecks = [];

        // register shutdown finalizers provided per option
        options.finalizers.forEach(this.addFinalizer.bind(this));

        // register readiness checks provided per option
        options.readinessChecks.forEach(this.addReadinessCheck.bind(this));
    }

    liveliness(request, response) {
        response.send(200,'OK');
    }

    readiness(request, response) {
        if (isReady === true) {
            // only run readiness checks at startup
            request.send(200, 'READY');
            return;
        }

        if (isTerminated() === true) {
            // service has been terminated by an external signal
            // this condition is mandatory
            request.send(503, 'NOT-READY');
            return;
        }

        this.checkReadiness((error) => {
            if (error !== undefined) {
                response.send(503, 'NOT-READY');
                return;
            }

            request.send(200, 'READY');
        });
    }

    checkReadiness(callback) {
        if (checkingReadiness === true) {
            callback(new Error('already checking readiness'));
            return;
        }

        checkingReadiness = true;

        if (readinessCheckTasks === undefined) {
            readinessCheckTasks = this.readinessChecks.map(check => {
                return function (cb) {
                    log.info('running readiness check "' + check.name + '"')
                    check(cb);
                };
            });
        }

        log.info('server start up: readiness checks all executed');
        async.parallel(readinessCheckTasks, (error) => {
            checkingReadiness = false;

            if (error !== null && error !== undefined) {
                log.info('server start up: readiness checks failed with error: ' + error.stack || error);
                callback(error);
                return;
            }

            log.info('server start up: readiness checks all executed');
            isReady = true;
            callback();
        });
    }

    /**
     *
     * @param {Function} fn function to be executed on shutdown taking "server" and "callback" arguments and returning an error or undefined
     */
    addFinalizer(fn) {
        addFunction(fn, this.shutdownFinalizers);
    }

    /**
     *
     * @returns {Function[]} returns registered finalizer functions
     */
    listFinalizers() {
        // return a copy of the finalizer array
        return [].concat(this.shutdownFinalizers);
    }

    /**
     *
     * @param {Function} fn function to be executed on startup taking "server" and "callback" arguments and returning an error or undefined
     */
    addReadinessCheck(fn) {
        addFunction(fn, this.readinessChecks);
    }

    /**
     *
     * @returns {Function[]} returns registered check functions
     */
    listChecks() {
        // return a copy of the readiness check array
        return [].concat(this.readinessChecks);
    }

    terminate(signal, callback) {
        this.killer.gracefulShutdown(this.server, signal, this.listFinalizers(), callback);
    }

    /**
     *
     * @param {{ signals, gracePeriodMilliseconds, readinessChecks, finalizers, delay, killer}} options
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
            throw new TypeError('finalizers options has to be an array of Functions');
        }

        if (options.readinessChecks === undefined) {
            options.readinessChecks = [];
        }

        if (options.readinessChecks.constructor !== Array) {
            throw new TypeError('readinessChecks options has to be an array of Functions');
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
 * @param {Function} fn
 * @param {Function[]} collection
 */
function addFunction(fn, collection) {
    if (typeof fn !== 'function') {
        throw new TypeError('provided function has to have "server" and "callback" arguments');
    }

    if (fn.name === '' || fn.name === undefined) {
        throw new TypeError('provided function has to be a named function');
    }

    let hasADuplicate = collection.some(finalizer => fn.name === finalizer.name);

    if (hasADuplicate === true) {
        log.info('provided function "' + fn.name + '" already registered - ignoring it');
        return;
    }

    collection.push(fn);
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
            if (isTerminated() === true) {
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
