const fs        = require('fs');
const net       = require('net');
const path      = require('path');

const net_utils = require('haraka-net-utils');

function ucFirst (string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

exports.register = function () {
  const plugin = this;

  plugin.load_geoip_ini();
  plugin.load_maxmind();
};

exports.load_geoip_ini = function () {
  const plugin = this;
  plugin.cfg = plugin.config.get('geoip.ini', {
    booleans: [
      '-main.calc_distance',
      '+show.city',
      '+show.region',
    ],
  },
  function () {
    plugin.load_geoip_ini();
  });

  // legacy settings
  const m = plugin.cfg.main;
  if (m.show_city  ) plugin.cfg.show.city = m.show_city;
  if (m.show_region) plugin.cfg.show.region = m.show_region;
};

exports.load_maxmind = function () {
  const plugin = this;

  try {
    plugin.maxmind = require('maxmind');
  }
  catch (e) {
    plugin.logerror(e);
    plugin.logerror("unable to load maxmind, try\n\n\t" +
         "'npm install -g maxmind'\n\n");
    return;
  }

  plugin.dbsLoaded = 0;
  const dbdir = plugin.cfg.main.dbdir || '/usr/local/share/GeoIP/';

  ['city', 'country'].forEach(function (db) {
    const dbPath = path.join(dbdir, 'GeoLite2-' + ucFirst(db) + '.mmdb');
    if (fs.existsSync(dbPath)) {
      plugin[db + 'Lookup'] = plugin.maxmind.openSync(dbPath, {
        watchForUpdates: true,
        cache: {
          max: 1000, // max items in cache
          maxAge: 1000 * 60 * 60 // life time in milliseconds
        }
      });
      plugin.dbsLoaded++;
    }
  });

  if (plugin.dbsLoaded === 0) {
    plugin.logerror('maxmind loaded but no GeoIP DBs found!');
    return;
  }

  plugin.loginfo('loaded maxmind with ' + plugin.dbsLoaded + ' DBs');
  plugin.register_hook('connect',   'lookup_maxmind');
  plugin.register_hook('data_post', 'add_headers');

  return true;
};

exports.lookup_maxmind = function (next, connection) {
  const plugin = this;

  if (!plugin.maxmind) { return next(); }
  if (!plugin.dbsLoaded) { return next(); }

  const loc = plugin.get_geoip_maxmind(connection.remote.ip);
  if (!loc) return next();

  const show = [];
  const agg_res = { emit: true };

  if (loc.continent && loc.continent.code && loc.continent.code !== '--') {
    agg_res.continent = loc.continent.code;
    show.push(loc.continent.code);
  }
  if (loc.country && loc.country.iso_code && loc.country.iso_code !== '--') {
    agg_res.country = loc.country.iso_code;
    show.push(loc.country.iso_code);
  }
  if (loc.subdivisions && loc.subdivisions[0].iso_code) {
    agg_res.region = loc.subdivisions[0].iso_code;
    if (plugin.cfg.show.region) show.push(loc.subdivisions[0].iso_code);
  }
  if (loc.city && loc.city.names) {
    agg_res.city = loc.city.names.en;
    if (plugin.cfg.show.city) show.push(loc.city.names.en);
  }
  if (loc.location && loc.location.latitude) {
    agg_res.ll = [loc.location.latitude, loc.location.longitude];
    agg_res.geo = { lat: loc.location.latitude, lon: loc.location.longitude };
  }
  if (show.length === 0) return next();

  agg_res.human = show.join(', ');

  if (!plugin.cfg.main.calc_distance || !loc.location) {
    connection.results.add(plugin, agg_res);
    return next();
  }

  plugin.calculate_distance(connection, agg_res.ll, function (err, distance) {
    if (err) {
      connection.results.add(plugin, {err: err});
    }
    if (distance) {
      agg_res.distance = distance;
      show.push(distance+'km');
      agg_res.human = show.join(', ');
    }
    connection.results.add(plugin, agg_res);
    return next();
  });
};

exports.get_geoip = function (ip) {
  const plugin = this;
  if (!ip) return;
  if (!net.isIPv4(ip) && !net.isIPv6(ip)) return;
  if (net_utils.is_private_ip(ip)) return;

  const res = plugin.get_geoip_maxmind(ip);
  if (!res) return;

  // console.log(res);
  const show = [];
  if (res.continent && res.continent.code) show.push(res.continent.code);
  if (res.country   && res.country.iso_code) show.push(res.country.iso_code);
  if (res.subdivisions && res.subdivisions[0]) show.push(res.subdivisions[0].iso_code);
  if (res.city && res.city.names) show.push(res.city.names.en);
  res.human = show.join(', ');

  return res;
};

exports.get_geoip_maxmind = function (ip) {
  const plugin = this;
  if (!plugin.maxmind) return;

  if (plugin.cityLookup) {
    return plugin.cityLookup.get(ip);
  }
  if (plugin.countryLookup) {
    return plugin.countryLookup.get(ip);
  }
};

exports.add_headers = function (next, connection) {
  const plugin = this;
  const txn = connection.transaction;
  if (!txn) { return; }
  txn.remove_header('X-Haraka-GeoIP');
  txn.remove_header('X-Haraka-GeoIP-Received');
  const r = connection.results.get('geoip');
  if (r) {
    if (r.country) txn.add_header('X-Haraka-GeoIP',   r.human  );
    if (r.asn)     txn.add_header('X-Haraka-ASN',     r.asn    );
    if (r.asn_org) txn.add_header('X-Haraka-ASN-Org', r.asn_org);
  }

  const received = [];

  const rh = plugin.received_headers(connection);
  if (rh && rh.length) received.push(rh);

  const oh = plugin.originating_headers(connection);
  if (oh) received.push(oh);

  // Add any received results to a trace header
  if (received.length) {
    txn.add_header('X-Haraka-GeoIP-Received', received.join(' '));
  }
  return next();
};

exports.get_local_geo = function (ip, connection) {
  const plugin = this;
  if (plugin.local_geoip) return;  // cached

  if (!plugin.local_ip) { plugin.local_ip = ip; }
  if (!plugin.local_ip) { plugin.local_ip = plugin.cfg.main.public_ip; }
  if (!plugin.local_ip) {
    connection.logerror(plugin, "can't calculate distance, " +
            'set public_ip in smtp.ini');
    return;
  }

  if (!plugin.local_geoip) {
    plugin.local_geoip = plugin.get_geoip(plugin.local_ip);
  }

  if (!plugin.local_geoip) {
    connection.logerror(plugin, "no GeoIP results for local_ip!");
  }
};

exports.calculate_distance = function (connection, rll, done) {
  const plugin = this;

  const cb = function (err, l_ip) {
    if (err) {
      connection.results.add(plugin, {err: err});
      connection.logerror(plugin, err);
    }

    plugin.get_local_geo(l_ip, connection);
    if (!plugin.local_ip || !plugin.local_geoip) { return done(); }

    const gl = plugin.local_geoip.location;
    const gcd = plugin.haversine(gl.latitude, gl.longitude, rll[0], rll[1]);
    if (gcd && isNaN(gcd)) return done();

    connection.results.add(plugin, {distance: gcd});

    if (plugin.cfg.main.too_far &&
      (parseFloat(plugin.cfg.main.too_far) < parseFloat(gcd))) {
      connection.results.add(plugin, {too_far: true});
    }
    done(err, gcd);
  };

  if (plugin.local_ip) return cb(null, plugin.local_ip);
  net_utils.get_public_ip(cb);
};

exports.haversine = function (lat1, lon1, lat2, lon2) {
  // calculate the great circle distance using the haversine formula
  // found here: http://www.movable-type.co.uk/scripts/latlong.html
  const EARTH_RADIUS = 6371; // km
  function toRadians (v) { return v * Math.PI / 180; }
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  lat1 = toRadians(lat1);
  lat2 = toRadians(lat2);

  const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
          Math.sin(deltaLon/2) * Math.sin(deltaLon/2) *
          Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return (EARTH_RADIUS * c).toFixed(0);
};

exports.received_headers = function (connection) {
  const plugin = this;
  const txn = connection.transaction;
  const received = txn.header.get_all('received');
  if (!received.length) return;

  const results = [];
  const ipany_re = net_utils.get_ipany_re('[\\[\\(](?:IPv6:)?', '[\\]\\)]');

  // Try and parse each received header
  for (let i=0; i < received.length; i++) {
    const match = ipany_re.exec(received[i]);
    if (!match) continue;
    if (net_utils.is_private_ip(match[1])) continue;  // exclude private IP

    const gi = plugin.get_geoip(match[1]);
    const country = gi ? (gi.country.iso_code) : '';
    let logmsg = 'received=' + match[1];
    if (country) {
      logmsg += ' country=' + country;
      results.push(match[1] + ':' + country);
    }
    connection.loginfo(plugin, logmsg);
  }
  return results;
};

exports.originating_headers = function (connection) {
  const plugin = this;
  const txn = connection.transaction;

  // Try and parse any originating IP headers
  const orig = txn.header.get('x-originating-ip') ||
             txn.header.get('x-ip') ||
             txn.header.get('x-remote-ip');

  if (!orig) return;

  const match = net_utils.get_ipany_re('(?:IPv6:)?').exec(orig);
  if (!match) return;

  const found_ip = match[1];
  if (net_utils.is_private_ip(found_ip)) return;

  const gi = plugin.get_geoip(found_ip);
  if (!gi) return;

  connection.loginfo(plugin, 'originating=' + found_ip + ' ' + gi.human);
  return found_ip + ':' + (gi.country.iso_ode);
};
