'use strict';

const util = require('util');

const prefix = '[graceful-shutdown] %d - ';

/**
 *
 * @param {string} msg
 */
function info(msg) {
    process.stderr.write(util.format(prefix, process.pid) + util.format.apply(util, arguments) + '\n');
}

module.exports = { info: info };
