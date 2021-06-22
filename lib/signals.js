'use strict';

/**
 *
 * @see https://people.cs.pitt.edu/~alanjawi/cs449/code/shell/UnixSignals.htm
 *
 * @type {{SIGINT: number, SIGTERM: number}}
 */
const signals = {
    SIGINT: 3,
    SIGTERM: 15
};

/**
 *
 * @param signal
 * @returns {number}
 */
function codeNumber(signal) {
    return signals[signal] || 1;
}

module.exports = { codeNumber: codeNumber };
