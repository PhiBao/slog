// dns-preload.cjs — local development workaround for this machine.
//
// The local WSL resolver (10.255.255.254) poisons www.reddit.com to 127.0.0.1,
// which breaks `devvit login`'s token exchange (and any CLI call to www.reddit.com).
// Chrome reaches reddit fine (DoH), so only CLI processes need this.
//
// Usage: NODE_OPTIONS="--require <this file>" <devvit command>
//
// It patches dns.lookup so that reddit hostnames resolve via public
// resolvers (1.1.1.1 / 8.8.8.8) instead of the poisoned local resolver.
// All other hostnames fall through to the original lookup untouched.

const dns = require("node:dns");

const OVERRIDE_HOSTS = new Set([
  "www.reddit.com",
  "reddit.com",
  "old.reddit.com",
  "new.reddit.com",
  "i.redd.it",
  "v.redd.it",
  "s.reddit.com",
]);

const publicResolver = new dns.promises.Resolver({ timeout: 4000, tries: 2 });
publicResolver.setServers(["1.1.1.1", "8.8.8.8"]);

const cache = new Map(); // host -> ipv4

const realLookup = dns.lookup;

function patchedLookup(hostname, options, callback) {
  // Normalize (hostname, callback) and (hostname, options, callback) forms.
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  const host = String(hostname);
  const finish = (fn) => {
    try { fn(); } catch (e) { /* never break the caller */ }
  };

  if (!OVERRIDE_HOSTS.has(host)) {
    return realLookup.call(dns, hostname, options, callback);
  }

  const cached = cache.get(host);
  const respond = (ip) => {
    if (options && options.all) {
      finish(() => callback(null, [{ address: ip, family: 4 }]));
    } else {
      finish(() => callback(null, ip, 4));
    }
  };

  if (cached) { respond(cached); return; }

  publicResolver
    .resolve4(host)
    .then((ips) => {
      const ip = ips[0];
      cache.set(host, ip);
      respond(ip);
    })
    .catch(() => {
      // fall back to the system resolver (will likely fail; caller retries)
      realLookup.call(dns, hostname, options, callback);
    });
}

dns.lookup = patchedLookup;
