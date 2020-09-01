const net       = require('net');

const net_utils = require('haraka-net-utils');

exports.register = function () {
  this.load_geoip_ini();
  this.load_geoip_lite();
}

exports.load_geoip_ini = function () {
  const plugin = this;
  plugin.cfg = plugin.config.get('geoip.ini', {
    booleans: [
      '+show.city',
      '+show.region',
      '-main.calc_distance',
      '+show.city',
      '+show.region',
    ],
  },
  function () {
    plugin.load_geoip_ini();
  });
}

exports.load_geoip_lite = function () {

  try {
    this.geoip = require('geoip-lite');
  }
  catch (e) {
    this.logerror("unable to load geoip-lite, try\n\n" +
              "\t'npm install -g geoip-lite'\n\n");
    return;
  }

  if (!this.geoip) {
    // geoip-lite dropped node 0.8 support, it may not have loaded
    this.logerror('unable to load geoip-lite');
    return;
  }

  this.loginfo('provider geoip-lite');
  this.register_hook('connect',   'lookup_geoip_lite');
  this.register_hook('data_post', 'add_headers');
}

exports.lookup_geoip_lite = function (next, connection) {
  const plugin = this;

  // geoip results look like this:
  // range: [ 3479299040, 3479299071 ],
  //    country: 'US',
  //    region: 'CA',
  //    city: 'San Francisco',
  //    ll: [37.7484, -122.4156]

  if (!plugin.geoip) {
    connection.logerror(plugin, 'geoip-lite not loaded');
    return next();
  }

  const r = plugin.get_geoip_lite(connection.remote.ip);
  if (!r) return next();

  connection.results.add(plugin, r);

  const show = [];
  if (r.country  && r.country !== '--') show.push(r.country);
  if (r.region   && plugin.cfg.main.show_region) { show.push(r.region); }
  if (r.city     && plugin.cfg.main.show_city  ) { show.push(r.city); }

  if (show.length === 0) return next();

  if (!plugin.cfg.main.calc_distance) {
    connection.results.add(plugin, {human: show.join(', '), emit:true});
    return next();
  }

  plugin.calculate_distance(connection, r.ll, function (err, distance) {
    if (distance) show.push(`${distance}km`);
    connection.results.add(plugin, {human: show.join(', '), emit:true});
    next();
  })
}

exports.lookup_maxmind = function (next, connection) {
  const plugin = this;

  const loc = plugin.get_geoip_maxmind(connection.remote.ip);
  if (!loc) return next();

  const [show, agg_res] = plugin.get_locales(loc);
  if (show.length === 0) return next();

  agg_res.human = show.join(', ');

  if (!plugin.cfg.main.calc_distance || !loc.location) {
    connection.results.add(plugin, agg_res);
    return next();
  }

  plugin.calculate_distance(connection, agg_res.ll, (err, distance) => {
    if (err) {
      connection.results.add(plugin, {err});
    }
    if (distance) {
      agg_res.distance = distance;
      show.push(`${distance}km`);
      agg_res.human = show.join(', ');
    }
    connection.results.add(plugin, agg_res);
    next();
  })
}

exports.get_geoip = function (ip) {
  const plugin = this;
  if (!ip) return;
  if (!net.isIPv4(ip) && !net.isIPv6(ip)) return;
  if (net_utils.is_private_ip(ip)) return;

  const res = plugin.get_geoip_lite(ip);
  if (!res) return;

  // console.log(res);
  const show = [];
  if (res.continentCode) show.push(res.continentCode);
  if (res.countryCode || res.code) show.push(res.countryCode || res.code);
  if (res.region)        show.push(res.region);
  if (res.city)          show.push(res.city);
  res.human = show.join(', ');

  return res;
}

exports.get_geoip_lite = function (ip) {
  if (!this.geoip) return;
  if (!net.isIPv4(ip)) return;

  const result = this.geoip.lookup(ip);
  if (result && result.ll) {
    result.latitude = result.ll[0];
    result.longitude = result.ll[1];
  }
  return result;
}

exports.add_headers = function (next, connection) {
  const plugin = this;
  const txn = connection.transaction;
  if (!txn) return;

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
  next();
}

exports.get_local_geo = function (ip, connection) {
  const plugin = this;
  if (plugin.local_geoip) return;  // cached

  if (!plugin.local_ip) plugin.local_ip = ip;
  if (!plugin.local_ip) plugin.local_ip = plugin.cfg.main.public_ip;
  if (!plugin.local_ip) {
    connection.logerror(plugin, "can't calculate distance, set public_ip in smtp.ini");
    return;
  }

  if (!plugin.local_geoip) {
    plugin.local_geoip = plugin.get_geoip(plugin.local_ip);
  }

  if (!plugin.local_geoip) {
    connection.logerror(plugin, "no GeoIP results for local_ip!");
  }
}

exports.calculate_distance = function (connection, rll, done) {
  const plugin = this;

  function cb (err, l_ip) {
    if (err) {
      connection.results.add(plugin, {err});
      connection.logerror(plugin, err);
    }

    plugin.get_local_geo(l_ip, connection);
    if (!plugin.local_ip || !plugin.local_geoip) return done();

    const gl = plugin.local_geoip.location;
    const gcd = plugin.haversine(gl.latitude, gl.longitude, rll[0], rll[1]);
    if (gcd && isNaN(gcd)) return done();

    connection.results.add(plugin, {distance: gcd});

    if (plugin.cfg.main.too_far &&
      (parseFloat(plugin.cfg.main.too_far) < parseFloat(gcd))) {
      connection.results.add(plugin, {too_far: true});
    }
    done(err, gcd);
  }

  if (plugin.local_ip) return cb(null, plugin.local_ip);
  net_utils.get_public_ip(cb);
}

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
}

exports.received_headers = function (connection) {
  const plugin = this;

  const received = connection.transaction.header.get_all('received');
  if (!received.length) return;

  const results = [];
  const ipany_re = net_utils.get_ipany_re('[\\[\\(](?:IPv6:)?', '[\\]\\)]');

  // Try and parse each received header
  for (let i=0; i < received.length; i++) {
    const match = ipany_re.exec(received[i]);
    if (!match) continue;
    if (net_utils.is_private_ip(match[1])) continue;  // exclude private IP

    const gi = plugin.get_geoip(match[1]);
    const country = get_country(gi);
    let logmsg = `received=${match[1]}`;
    if (country) {
      logmsg += ` country=${country}`;
      results.push(`${match[1]}:${country}`);
    }
    connection.loginfo(plugin, logmsg);
  }
  return results;
}

function get_country (gi) {
  if (!gi) return '';
  if (!gi.country) {
    if (gi.countryCode) return gi.countryCode; // geoip-lite
    if (gi.code) return gi.code;               // geoip-lite
    return '';
  }
  if (!gi.country.iso_code) return '';
  return gi.country.iso_code;
}

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

  connection.loginfo(plugin, `originating=${found_ip} ${gi.human}`);
  return `${found_ip}:${get_country(gi)}`;
}
