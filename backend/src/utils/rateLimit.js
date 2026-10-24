/**
 * Small in-memory limiter: `hit(key)` records an attempt and returns true once `max` attempts were
 * made within `windowMs`. Per server process, which is all this single-instance app needs.
 */
function createRateLimiter({ max, windowMs }) {
  const attempts = new Map(); // key -> timestamps

  return function hit(key) {
    const since = Date.now() - windowMs;
    const times = (attempts.get(key) || []).filter((t) => t > since);
    times.push(Date.now());
    attempts.set(key, times);
    if (attempts.size > 10000) attempts.clear(); // never let the map grow without bound
    return times.length > max;
  };
}

module.exports = { createRateLimiter };
