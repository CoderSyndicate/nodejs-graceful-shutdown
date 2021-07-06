'use strict';

const expect = require('chai').expect;
const http = require('http');
const sgsd = require('../index');
let gracefulShutdown;
let serverKiller;
let server;

describe('[' + __filename.substring(__filename.indexOf('/test/') + 1) + '] - Graceful Shutdown', function() {

    beforeEach(function (done) {
        server = http.createServer();
        FakeServer(server);

        serverKiller = new sgsd.ServerKiller({
            gracePeriodMilliseconds: 500,
        });

        serverKiller.destroyServer = function (signal, callback) {
            expect(signal).to.equal('SIGTERM');
            callback();
        };

        gracefulShutdown = new sgsd.ServerGracefulShutdown(
            server,
            {
                gracePeriodMilliseconds: 500,
                killer: serverKiller,
            }
        );

        server.listen((error) => {
            expect(error).to.equal(undefined);
            done();
        })
    });

    describe(' - shutdown ', function () {

        it.skip('should drain connections', function () {
            sgsd.enable(server, {});


            expect(sgsd.enable.bind(null, server, {})).to.throw('server graceful shutdown already enabled');
        });

    });

    describe(' - shutdown finalizers ', function () {

        it('should throw an error if option is not an Array', function () {
            let test = function () {
                return new sgsd.ServerGracefulShutdown(server, {finalizers: {}});
            };

            expect(test).to.throw('finalizers options has to be an array of Functions');
        });

        it('should throw an error if a finalizer is not a function', function () {
            let test = function () {
                return new sgsd.ServerGracefulShutdown(server, {finalizers: ['bla']});
            };

            expect(test).to.throw('provided function has to have "server" and "callback" arguments');
        });

        it('should throw an error if a finalizer is not a named function', function () {
            let test = function () {
                return new sgsd.ServerGracefulShutdown(server, {finalizers: [function (callback) {
                        callback();
                    }]});
            };

            expect(test).to.throw('provided function has to be a named function');
        });

        it('should add a finalizer to finalizer list through option', function () {
            let finalizers = [
                function test(callback) {
                    callback();
                }
            ];

            let test = new sgsd.ServerGracefulShutdown(server, {finalizers: finalizers});

            expect(test.listFinalizers().length).to.equal(1);
            expect(test.listFinalizers()).to.deep.equal(finalizers);
        });

        it('should add a finalizer to finalizer list through method "addFinalizer"', function () {
            let finalizer = function test(callback) {
                callback();
            };

            let finalizers = [
                finalizer,
            ];

            gracefulShutdown.addFinalizer(finalizer);

            expect(gracefulShutdown.listFinalizers().length).to.equal(1);
            expect(gracefulShutdown.listFinalizers()).to.deep.equal(finalizers);
        });

        it('should ignore duplicate finalizers', function () {
            let finalizer = function test(callback) {
                callback();
            };

            let finalizers = [
                finalizer,
            ];

            gracefulShutdown.addFinalizer(finalizer);
            gracefulShutdown.addFinalizer(finalizer);

            expect(gracefulShutdown.listFinalizers().length).to.equal(1);
            expect(gracefulShutdown.listFinalizers()).to.deep.equal(finalizers);
        });

        it('should register multiple finalizers', function () {
            let finalizers = [
                function test1(callback) {
                    callback();
                },
                function test2(callback) {
                    callback();
                }
            ];

            let test = new sgsd.ServerGracefulShutdown(server, {finalizers: finalizers});

            expect(test.listFinalizers().length).to.equal(2);
            expect(test.listFinalizers()).to.deep.equal(finalizers);
        });

        it('should have no default finalizer', function () {
            expect(gracefulShutdown.listFinalizers().length).to.equal(0);
        });

    });

    describe(' - readiness checks ', function () {

        it('should throw an error if option is not an Array', function () {
            let test = function () {
                return new sgsd.ServerGracefulShutdown(server, {readinessChecks: {}});
            };

            expect(test).to.throw('readinessChecks options has to be an array of Functions');
        });

        it('should throw an error if a readiness check is not a function', function () {
            let test = function () {
                return new sgsd.ServerGracefulShutdown(server, {readinessChecks: ['bla']});
            };

            expect(test).to.throw('provided function has to have "server" and "callback" arguments');
        });

        it('should throw an error if a readiness check is not a named function', function () {
            let test = function () {
                return new sgsd.ServerGracefulShutdown(server, {readinessChecks: [function (callback) {
                        callback();
                    }]});
            };

            expect(test).to.throw('provided function has to be a named function');
        });

        it('should add a check to the readiness check list through option', function () {
            let readinessChecks = [
                function test(callback) {
                    callback();
                }
            ];

            let test = new sgsd.ServerGracefulShutdown(server, {readinessChecks: readinessChecks});

            expect(test.listChecks().length).to.equal(1);
            expect(test.listChecks()).to.deep.equal(readinessChecks);
        });

        it('should add a finalizer to finalizer list through method "addFinalizer"', function () {
            let finalizer = function test(callback) {
                callback();
            };

            let finalizers = [
                finalizer,
            ];

            gracefulShutdown.addFinalizer(finalizer);

            expect(gracefulShutdown.listFinalizers().length).to.equal(1);
            expect(gracefulShutdown.listFinalizers()).to.deep.equal(finalizers);
        });

        it('should ignore duplicate finalizers', function () {
            let finalizer = function test(callback) {
                callback();
            };

            let finalizers = [
                finalizer,
            ];

            gracefulShutdown.addFinalizer(finalizer);
            gracefulShutdown.addFinalizer(finalizer);

            expect(gracefulShutdown.listFinalizers().length).to.equal(1);
            expect(gracefulShutdown.listFinalizers()).to.deep.equal(finalizers);
        });

        it('should register multiple finalizers', function () {
            let finalizers = [
                function test1(callback) {
                    callback();
                },
                function test2(callback) {
                    callback();
                }
            ];

            let test = new sgsd.ServerGracefulShutdown(server, {finalizers: finalizers});

            expect(test.listFinalizers().length).to.equal(2);
            expect(test.listFinalizers()).to.deep.equal(finalizers);
        });

        it('should have no default finalizer', function () {
            expect(gracefulShutdown.listFinalizers().length).to.equal(0);
        });

    });

    describe(' - behaviour ', function () {

        it('should throw an error if graceful shutdown was already enabled', function () {
            sgsd.enable(server, {});
            expect(sgsd.enable.bind(null, server, {})).to.throw('server graceful shutdown already enabled');
        });

        it('should execute readiness checks only on startup', function (done) {
            let finalizers = [
                function readinessCheck1(server, callback) {
                    server.fake.calledReadinessChecks.push('readinessCheck1');
                    callback();
                },
                function readinessCheck2(server, callback) {
                    server.fake.calledReadinessChecks.push('readinessCheck2');
                    callback();
                },
            ];

            gracefulShutdown.addFinalizer(finalizers[0]);
            gracefulShutdown.addFinalizer(finalizers[1]);

            sgsd.enable(server, gracefulShutdown);

            gracefulShutdown.terminate('SIGTERM', function () {
                expect(server.fake.calledHandlers).to.deep.equal({listening: [ 'bound onceWrapper' ], close: [ 'bound onceWrapper' ]});
                expect(server.fake.calledReadinessChecks.indexOf('readinessCheck1')).to.be.gt(-1);
                expect(server.fake.calledReadinessChecks.indexOf('readinessCheck2')).to.be.gt(-1);

                done();
            })
        });

        it('should execute finalizers on shutdown', function (done) {
            let finalizers = [
                function finalizer1(server, callback) {
                    server.fake.calledFinalizers.push('finalizer1');
                    callback();
                },
                function finalizer2(server, callback) {
                    server.fake.calledFinalizers.push('finalizer2');
                    callback();
                },
            ];

            gracefulShutdown.addFinalizer(finalizers[0]);
            gracefulShutdown.addFinalizer(finalizers[1]);

            sgsd.enable(server, gracefulShutdown);

            gracefulShutdown.terminate('SIGTERM', function () {
                expect(server.fake.calledHandlers).to.deep.equal({listening: [ 'bound onceWrapper' ], close: [ 'bound onceWrapper' ]});
                expect(server.fake.calledFinalizers.indexOf('finalizer1')).to.be.gt(-1);
                expect(server.fake.calledFinalizers.indexOf('finalizer2')).to.be.gt(-1);

                done();
            })
        });

    });
});

function FakeServer(server) {

    if (server.fake !== undefined) {
        return server;
    }

    server.fake = {
        calledFinalizers: [],
        calledReadinessChecks: [],
        calledHandlers: {},
        eventHandlers: {},
    };

    server._on = server.on;

    server.on = function fakeEventRegister(event, handler) {
        if (this.fake.eventHandlers[event] === undefined) {
            this.fake.eventHandlers[event] = [];
        }

        let eventHandlerWrapper = function handlerWrapper() {
            if (this.fake.calledHandlers[event] === undefined) {
                this.fake.calledHandlers[event] = [];
            }

            this.fake.calledHandlers[event].push(handler.name);

            handler();
        }.bind(server);

        this.fake.eventHandlers[event].push(handler.name);

        this._on(event, eventHandlerWrapper);
    };

    return server;
}
