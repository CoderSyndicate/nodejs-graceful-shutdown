'use strict';

const async = require('async');
const signals = require('./signals');
const log = require('./log');


class ServerKiller {

    /**
     *
     * @param {{gracePeriodMilliseconds, delay}} options
     */
    constructor(options) {
        options = options || {};

        this.gracePeriodMilliseconds = options.gracePeriodMilliseconds;
    }

    /**
     *
     * @param {net.Server}  server
     * @param {string}      signal
     * @param {function[]} finalizers to be executed at the end of the graceful sequence
     * @param {function} callback
     */
    gracefulShutdown(server, signal, finalizers, callback) {
        log.info('invoke graceful shutdown after %dms caused by signal.', this.gracePeriodMilliseconds);

        let tasks = [
            this.waitGracePeriod.bind(this),
            this.drainConnections.bind(this, server),
            this.runFinalizers.bind(this, server, finalizers),
            this.destroyServer.bind(this, signal),
        ];

        async.waterfall(tasks, function () {
            callback();
        });
    }

    /**
     *
     * @param {function} callback
     */
    waitGracePeriod(callback) {
        log.info('wait grace period: enable cluster to remove pod from routing.');
        setTimeout(callback, this.gracePeriodMilliseconds);
    }


    /**
     *
     * @param {net.Server}  server
     * @param {function} callback
     */
    drainConnections(server, callback) {
        const serv = server.hasOwnProperty('server') ? server.server : server;

        log.info('drain connections: close http listener and wait for pending requests.');
        serv.shutdown(function () {
            callback();
        });
    }

    /**
     *
     * @param {net.Server}  server
     * @param {function[]} finalizers to be executed at the end of the graceful sequence
     * @param {function} callback
     */
    runFinalizers(server, finalizers, callback) {
        let tasks = finalizers.map(finalizer => {
            return function (server, cb) {
                log.info('running finalizer "' + finalizer.name + '"')
                finalizer(server, cb);
            }.bind(null, server);
        });

        log.info('server shut down: execute finalizers');
        async.parallel(tasks, (error) => {
            log.info('server shut down: finalizers all executed');
            callback(error)
        });
    }

    /**
     *
     * @param {string}     signal
     * @param {function} callback
     */
    destroyServer(signal, callback) {
        log.info('server shut down: schedule process exit');
        setTimeout(function () {
            process.exit(128 + signals.codeNumber(signal))
        }, 1000);

        callback();
    }
}

module.exports = ServerKiller;
