'use strict';

const Firebase = require('firebase');
const FirebaseTokenGenerator = require('firebase-token-generator');

let simulationQueue = Promise.resolve(), simulationConsoleLogs;


class SimulatorProxy {
  constructor(simulator, token) {
    this._simulator = simulator;
    this._token = token;
  }

  async on(ref) {
    return this._simulator.simulate(this._token, ref, [{method: 'once', args: ['value']}]);
  }

  async once(ref) {
    return this._simulator.simulate(this._token, ref, [{method: 'once', args: ['value']}]);
  }

  async set(ref, value) {
    return this._simulator.simulate(this._token, ref, [{method: 'set', args: [value]}]);
  }

  async update(ref, value) {
    return this._simulator.simulate(this._token, ref, [{method: 'update', args: [value]}]);
  }

  async remove(ref) {
    return this._simulator.simulate(this._token, ref, [{method: 'remove'}]);
  }

  async push(ref, value) {
    return this._simulator.simulate(this._token, ref, [{method: 'push', args: [value]}]);
  }

  async transaction(ref, value) {
    return this._simulator.simulate(
      this._token, ref, [{method: 'once', args: ['value']}, {method: 'set', args: [value]}]);
  }
}

exports.Simulator = class Simulator {
  /**
   * Create a new simulator for debugging permission denied errors.
   * @param {Database} database The Firebase Admin SDK database object for which you want to debug
   *     failures.
   * @param {string} legacySecret A legacy database secret from your Firebase console, to
   *     authenticate access via the Firebase 2.x API.
   */
  constructor(database, legacySecret) {
    this._simulatedFirebase =
      new Firebase(database.ref().toString(), 'permission_denied_simulator');
    this._databaseUrl = this._simulatedFirebase.toString();
    this._tokenGenerator = new FirebaseTokenGenerator(legacySecret);
  }

  /**
   * Guess whether the given error is a Firebase permission denied error, or something else.
   * @param {Error} error The error to inspect.
   * @return True iff the error is a permission denied error.
   */
  isPermissionDenied(error) {
    const code = error.code || error.message;
    return code && code.toLowerCase() === 'permission_denied';
  }

  /**
   * Establish the identity under which to simulate calls.
   * @param {Object} claims The claims to be minted into a simulation token, including the uid and
   *     any extra claims you need to include to match the real custom token.
   * @return {Object} An interface for simulating calls that could fail with a permission denied
   *     error.  Each of the methods below returns an explanatory string and will never throw an
   *     exception due to the read or write failing.  (But will still throw if the arguments don't
   *     validate.)
   *       async on(ref)
   *       async once(ref)
   *       async set(ref, value)
   *       async update(ref, value)
   *       async remove(ref)
   *       async push(ref, value)
   *       async transaction(ref, value)
   *     The transaction method requires you to pass the actual value that your transaction update
   *     function generated, not the function itself.
   */
  auth(claims) {
    const token = this._tokenGenerator.createToken(claims, {simulate: true, debug: true});
    return new SimulatorProxy(this, token);
  }

  async _simulate(token, ref, calls) {
    if (!ref.toString().startsWith(this._databaseUrl)) {
      throw new Error(`Ref not in database ${this._simulatedFirebase}: ${ref}`);
    }
    const simulatedRef =
      this._simulatedFirebase.child(ref.toString().slice(this._databaseUrl.length));
    // Intercept the console as late as possible, so that we can add our filter at the top and elide
    // permission traces before anybody else tries to process them.
    interceptConsoleLog();
    simulationQueue = simulationQueue
      .catch(() => {/* ignore errors from previous simulations */})
      .then(() => this._simulateCalls(token, simulatedRef, calls));
    return simulationQueue;
  }

  async _simulateCalls(token, simulatedRef, calls) {
    try {
      this._simulatedFirebase.unauth();
      await this._simulatedFirebase.authWithCustomToken(
        token, () => {/* ignore */}, {remember: 'none'});
      const traces = [];
      for (const call of calls) {
        const trace = await this._simulateCall(simulatedRef, call);
        if (trace) traces.push(trace);
      }
      if (!traces.length) return 'Unable to reproduce error in simulation';
      return traces.join('\n\n');
    } catch (e) {
      return `Error running simulation: ${e}`;
    }
  }

  async _simulateCall(simulatedRef, {method, args}) {
    simulationConsoleLogs = [];
    try {
      await simulatedRef[method].apply(simulatedRef, args);
    } catch (e) {
      if (this.isPermissionDenied(e)) return simulationConsoleLogs.join('\n');
      return `Got a different error in simulation: ${e}`;
    }
  }
};


let consoleIntercepted = false, lastTestIndex;

function interceptConsoleLog() {
  if (consoleIntercepted) return;
  const originalLog = console.log;
  console.log = function() {
    const message = Array.prototype.join.call(arguments, ' ');
    if (!/^(FIREBASE: \n?)+/.test(message)) return originalLog.apply(console, arguments);
    processTraceLine(message);
  };
  consoleIntercepted = true;
}

function processTraceLine(line) {
  line = line
    .replace(/^(FIREBASE: \n?)+/, '')
    .replace(/^\s+([^.]*):(?:\.(read|write|validate):)?.*/g, (match, g1, g2) => {
      g2 = g2 || 'read';
      if (g2 === 'validate') g2 = 'value';
      return ' ' + g2 + ' ' + g1;
    });
  if (/^\s+/.test(line)) {
    const match = line.match(/^\s+=> (true|false)/);
    if (match) {
      if (match[1] === 'true' && simulationConsoleLogs[lastTestIndex].startsWith(' value')) {
        simulationConsoleLogs.splice(lastTestIndex, 1);
      } else {
        simulationConsoleLogs[lastTestIndex] =
          (match[1] === 'true' ? ' \u2713' : ' \u2717') + simulationConsoleLogs[lastTestIndex];
      }
      lastTestIndex = undefined;
    } else {
      if (lastTestIndex === simulationConsoleLogs.length - 1) simulationConsoleLogs.pop();
      simulationConsoleLogs.push(line);
      lastTestIndex = simulationConsoleLogs.length - 1;
    }
  } else if (/^\d+:\d+: /.test(line)) {
    simulationConsoleLogs.push('   ' + line);
  } else {
    if (lastTestIndex === simulationConsoleLogs.length - 1) simulationConsoleLogs.pop();
    simulationConsoleLogs.push(line);
    lastTestIndex = undefined;
  }
}
