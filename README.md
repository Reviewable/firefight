# firefight

[![Project Status: Active – The project has reached a stable, usable state and is being actively developed.](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)

This is a library of functions useful for debugging Firebase real-time database problems.  The API below is copied from the source, which is authoritative.

```js
class Simulator {

  /**
   * Create a new simulator for debugging permission denied errors.
   * @param {Database} database The Firebase Admin SDK database object for which you want to debug
   *     failures.
   * @param {string} legacySecret A legacy database secret from your Firebase console, to
   *     authenticate access via the Firebase 2.x API.
   */
  constructor(database, legacySecret)

  /**
   * Guess whether the given error is a Firebase permission denied error, or something else.
   * @param {Error} error The error to inspect.
   * @return True iff the error is a permission denied error.
   */
  isPermissionDenied(error)

  /**
   * Establish the identity under which to simulate calls, and return an object that you can use to
   * issue simulated calls.
   * @param {Object} claims The claims to be minted into a simulation token, including the uid and
   *     any extra claims you need to include to match the real custom token.
   * @return {Object} An interface for simulating calls that could fail with a permission denied
   *     error.  Each of the methods below returns an explanatory string, and does not actually read
   *     or write the database.  The methods will only throw exceptions if the arguments are invalid
   *     and never due to a read or write failure.
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
  auth(claims)
}
```
