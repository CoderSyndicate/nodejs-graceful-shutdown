graceful-astalavista
====

## Concept

A Graceful Shutdown allows the process to finish processing pending responses and release used ressources before been killed

In Kubernetes a Service Pod can be killed any time due to scaling or any other automated/manual administration command,
the service process must be able to support the [Kubernetes Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) by providing 2 probe routes: liveness and readiness

- `liveness` only refects that the process exists, is stable and is accessible
- `readiness` shows that the service dependecies (DB, ...) are available and is ready to process requests

While `READY` a pod will be in the service pod pool to which the traffic is directed and will receive requests to process,
on the other hand while `NOT-READY` it will leave the pool, receive no new traffic and have a grace periode to finish processing
pending responses and release used ressources (DB connections, ...) before been shut down

## Flowchart

![graceful-shutdown-flowchart](./Kubernetes-graceful-shutdown-flowchart.png)

### Liveness

a route `/heath` returning a Response Status `200` and Body `OK` as soon as the service port is open

### Readiness

a route `/health/readiness` returning a Response Status `200` and Body `READY` as soon as
all service dependencies are available (DB connections, ...), `503` and `NOT-READY` otherwise

## Options

- `gracePeriodMilliseconds`: grace period in milliseconds, must be longer than the average processing time (default: 5000)
- `finalizers`: an array of functions, taking "server" and "callback" as arguments, to be executed on shutdown. 

## Usage

```javascript
const astalavista = require('@codersyndicate/graceful-shutdown');
const someDBLib = require('something'); // optional: service may have no dependencies

const options = {
    gracePeriodMilliseconds: 10000,
    finalizers: [
        function doSomethingUseful(server, callback) {
            console.log('i am dead...')
            callback();
        },
    ],
}

// astalavista returns a ServerGracefulShutdown instance
let graceful = astalavista.enable(server, options);

server.use('/health/readiness', (req, res) => {
    if (astalavista.isTerminated()) {
        // service has been terminated by an external signal
        // this condition is mandatory
        return res.send(503, 'NOT-READY');
    }

    /* optional block: service may have no dependencies */
    if (!someDBLib.connected) {
        // DB dependency is not satisfied
        // service can not work properly
        return res.send(503, 'NOT-READY');
    }
    /* optional block */

    res.send(200, 'READY');
});

server.use('/health', (req, res) => {
    res.send(200,'OK');
});

// add a finalizer after initialisation
graceful.addFinalizer(function doSomethingEvenBetter(server, callback) {
  console.log('i shall return! (famous last words)')
  callback();
});

```
