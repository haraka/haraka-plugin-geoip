const fs        = require('fs')
const net       = require('net')
const path      = require('path')

const net_utils = require('haraka-net-utils')

const plugin_name = 'geoip'

function ucFirst (string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

exports.register = async function () {
  this.load_geoip_ini()

  if (plugin_name === 'geoip-lite') return this.register_geolite()

  try {
    this.maxmind = require('maxmind')
  }
  catch (e) {
    this.logerror(e.message)
    this.logerror(`unable to load maxmind, try\n\n\t'npm install -g maxmind'\n\n`)
  }

  await this.load_dbs()

  if (this.dbsLoaded) {
    this.register_hook('connect',   'lookup_maxmind')
    this.register_hook('data_post', 'add_headers')
  }
}

exports.register_geolite = function () {

  try {
    this.geoip = require('geoip-lite')
  }
  catch (e) {
    this.logerror(`unable to load geoip-lite, try\n\n\t'npm install -g geoip-lite'\n\n`)
    return
  }

  if (!this.geoip) {
    // geoip-lite dropped node 0.8 support, it may not have loaded
    this.logerror('unable to load geoip-lite')
    return
  }

  if (this.geoip) {
    this.loginfo('provider geoip-lite')
    this.register_hook('connect',   'lookup_geoip_lite')
    this.register_hook('data_post', 'add_headers')
  }
}

exports.load_geoip_ini = function () {
  const plugin = this

  plugin.cfg = plugin.config.get('geoip.ini', {
    booleans: [
      '-main.calc_distance',
      '+show.city',
      '+show.region',
    ],
  },
  function () {
    plugin.load_geoip_ini()
  })

  // legacy settings
  const m = plugin.cfg.main
  if (m.show_city  ) plugin.cfg.show.city = m.show_city
  if (m.show_region) plugin.cfg.show.region = m.show_region
}

exports.load_dbs = async function () {
  if (!this.maxmind) return

  this.dbsLoaded = 0
  const dbdir = this.cfg.main.dbdir || '/usr/local/share/GeoIP/'

  for (const db of ['city', 'country', 'ASN']) {
    const dbPath = path.join(dbdir, `GeoLite2-${ucFirst(db)}.mmdb`)
    if (!fs.existsSync(dbPath)) {
      this.logdebug(`missing DB ${dbPath}`)
      continue
    }

    this[`${db}Lookup`] = await this.maxmind.open(dbPath, {
      // this causes tests to hang, which is why mocha runs with --exit
      watchForUpdates: true,
      cache: {
        max: 1000, // max items in cache
        maxAge: 1000 * 60 * 60 // life time in milliseconds
      }
    })
    this.logdebug(`loaded maxmind db ${dbPath}`)
    this.dbsLoaded++
  }

  this.logdebug(`loaded maxmind with ${this.dbsLoaded} DBs`)
}

exports.get_locales = function (loc) {

  const show = []
  const agg_res = { emit: true }

  if (loc.continent && loc.continent.code && loc.continent.code !== '--') {
    agg_res.continent = loc.continent.code
    show.push(loc.continent.code)
  }

  if (loc.country && loc.country.iso_code && loc.country.iso_code !== '--') {
    agg_res.country = loc.country.iso_code
    show.push(loc.country.iso_code)
  }

  if (loc.subdivisions && loc.subdivisions[0].iso_code) {
    agg_res.region = loc.subdivisions[0].iso_code
    if (this.cfg.show.region) show.push(loc.subdivisions[0].iso_code)
  }

  if (loc.city && loc.city.names) {
    agg_res.city = loc.city.names.en
    if (this.cfg.show.city) show.push(loc.city.names.en)
  }

  if (loc.location && isFinite(loc.location.latitude)) {
    agg_res.ll = [loc.location.latitude, loc.location.longitude]
    agg_res.geo = { lat: loc.location.latitude, lon: loc.location.longitude }
  }

  return [show, agg_res]
}

exports.lookup = function (next, connection) {
  if (plugin_name === 'geoip') return this.lookup_maxmind(next, connection)
  return this.lookup_geoip_lite(next, connection)
}

exports.lookup_geoip_lite = function (next, connection) {

  // geoip results look like this:
  // range: [ 3479299040, 3479299071 ],
  //    country: 'US',
  //    region: 'CA',
  //    city: 'San Francisco',
  //    ll: [37.7484, -122.4156]

  if (!this.geoip) {
    connection.logerror(this, 'geoip-lite not loaded')
    return next()
  }

  const r = this.get_geoip_lite(connection.remote.ip)
  if (!r) return next()

  connection.results.add(this, r)

  const show = []
  if (r.country  && r.country !== '--') show.push(r.country)
  if (r.region   && this.cfg.main.show_region) show.push(r.region)
  if (r.city     && this.cfg.main.show_city  ) show.push(r.city)

  if (show.length === 0) return next()

  if (!this.cfg.main.calc_distance) {
    connection.results.add(this, {human: show.join(', '), emit:true})
    return next()
  }

  this.calculate_distance(connection, r.ll, (err, distance) => {
    if (distance) show.push(`${distance}km`)
    connection.results.add(this, {human: show.join(', '), emit:true})
    next()
  })
}

exports.lookup_maxmind = function (next, connection) {

  const loc = this.get_geoip_maxmind(connection.remote.ip)
  if (!loc) return next()

  const [show, agg_res] = this.get_locales(loc)
  if (show.length === 0) return next()

  agg_res.human = show.join(', ')

  if (!this.cfg.main.calc_distance || !loc.location) {
    connection.results.add(this, agg_res)
    return next()
  }

  this.calculate_distance(connection, agg_res.ll, (err, distance) => {
    if (err) connection.results.add(this, {err})

    if (distance) {
      agg_res.distance = distance
      show.push(`${distance}km`)
      agg_res.human = show.join(', ')
    }
    connection.results.add(this, agg_res)
    next()
  })
}

exports.get_geoip = function (ip) {

  switch (true) {
    case (!ip):
    case (!net.isIPv4(ip) && !net.isIPv6(ip)):
    case (net_utils.is_private_ip(ip)):
      return
  }

  let res
  if (plugin_name === 'geoip')      res = this.get_geoip_maxmind(ip)
  if (plugin_name === 'geoip-lite') res = this.get_geoip_lite(ip)
  if (!res) return

  // console.log(res);
  const show = []

  if (plugin_name === 'geoip-lite') {
    if (res.continentCode) show.push(res.continentCode)
    if (res.countryCode || res.code) show.push(res.countryCode || res.code)
    if (res.region)        show.push(res.region)
    if (res.city)          show.push(res.city)
  }

  if (plugin_name === 'geoip') {     // maxmind
    if (res.continent && res.continent.code) show.push(res.continent.code)
    if (res.country   && res.country.iso_code) show.push(res.country.iso_code)
    if (res.subdivisions && res.subdivisions[0]) show.push(res.subdivisions[0].iso_code)
    if (res.city && res.city.names) show.push(res.city.names.en)
  }

  res.human = show.join(', ')
  return res
}

exports.get_geoip_lite = function (ip) {
  if (!this.geoip) return
  if (!net.isIPv4(ip)) return

  const result = this.geoip.lookup(ip)
  if (result && result.ll) {
    result.latitude = result.ll[0]
    result.longitude = result.ll[1]
  }
  return result
}

exports.get_geoip_maxmind = function (ip) {

  if (!this.maxmind) return
  if (!this.dbsLoaded) return

  if (this.cityLookup) {
    try { return this.cityLookup.get(ip) }
    catch (ignore) {}
  }
  if (this.countryLookup) {
    try { return this.countryLookup.get(ip) }
    catch (ignore) {}
  }
}

exports.add_headers = function (next, connection) {
  const txn = connection.transaction
  if (!txn) return

  txn.remove_header('X-Haraka-GeoIP')
  txn.remove_header('X-Haraka-GeoIP-Received')

  const r = connection.results.get(plugin_name)
  if (r) {
    if (r.country) txn.add_header('X-Haraka-GeoIP',   r.human  )
    if (r.asn)     txn.add_header('X-Haraka-ASN',     r.asn    )
    if (r.asn_org) txn.add_header('X-Haraka-ASN-Org', r.asn_org)
  }

  const received = []

  const rh = this.received_headers(connection)
  if (rh && rh.length) received.push(rh)

  const oh = this.originating_headers(connection)
  if (oh) received.push(oh)

  // Add any received results to a trace header
  if (received.length) {
    txn.add_header('X-Haraka-GeoIP-Received', received.join(' '))
  }
  next()
}

exports.get_local_geo = function (ip, connection) {
  if (this.local_geoip) return  // cached

  if (!this.local_ip) this.local_ip = ip
  if (!this.local_ip) this.local_ip = this.cfg.main.public_ip
  if (!this.local_ip) {
    connection.logerror(this, "can't calculate distance, set public_ip in smtp.ini")
    return
  }

  if (!this.local_geoip) {
    this.local_geoip = this.get_geoip(this.local_ip)
  }

  if (!this.local_geoip) {
    connection.logerror(this, "no GeoIP results for local_ip!")
  }
}

exports.calculate_distance = function (connection, rll, done) {
  const plugin = this

  function cb (err, l_ip) {
    if (err) {
      connection.results.add(plugin, {err})
      connection.logerror(plugin, err)
    }

    plugin.get_local_geo(l_ip, connection)
    if (!plugin.local_ip || !plugin.local_geoip) return done()

    // maxmind has 'location' property, geoip-lite doesn't
    const gl = plugin.local_geoip.location ? plugin.local_geoip.location : plugin.local_geoip
    const gcd = plugin.haversine(gl.latitude, gl.longitude, rll[0], rll[1])
    if (gcd && isNaN(gcd)) return done()

    connection.results.add(plugin, {distance: gcd})

    if (plugin.cfg.main.too_far &&
      (parseFloat(plugin.cfg.main.too_far) < parseFloat(gcd))) {
      connection.results.add(plugin, {too_far: true})
    }
    done(err, gcd)
  }

  if (plugin.local_ip) return cb(null, plugin.local_ip)
  net_utils.get_public_ip(cb)
}

exports.haversine = function (lat1, lon1, lat2, lon2) {
  // calculate the great circle distance using the haversine formula
  // found here: http://www.movable-type.co.uk/scripts/latlong.html
  const EARTH_RADIUS = 6371 // km
  function toRadians (v) { return v * Math.PI / 180 }
  const deltaLat = toRadians(lat2 - lat1)
  const deltaLon = toRadians(lon2 - lon1)
  lat1 = toRadians(lat1)
  lat2 = toRadians(lat2)

  const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
          Math.sin(deltaLon/2) * Math.sin(deltaLon/2) *
          Math.cos(lat1) * Math.cos(lat2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return (EARTH_RADIUS * c).toFixed(0)
}

exports.received_headers = function (connection) {

  const received = connection.transaction.header.get_all('received')
  if (!received.length) return []

  const results = []
  const ipany_re = net_utils.get_ipany_re('[\\[\\(](?:IPv6:)?', '[\\]\\)]')

  // Try and parse each received header
  for (let i=0; i < received.length; i++) {
    const match = ipany_re.exec(received[i])
    if (!match) continue
    if (net_utils.is_private_ip(match[1])) continue  // exclude private IP

    const gi = this.get_geoip(match[1])
    const country = get_country(gi)
    let logmsg = `received=${match[1]}`
    if (country) {
      logmsg += ` country=${country}`
      results.push(`${match[1]}:${country}`)
    }
    connection.loginfo(this, logmsg)
  }
  return results
}

function get_country (gi) {
  if (plugin_name === 'geoip-lite') return get_country_lite(gi)
  if (!gi) return ''
  if (!gi.country) return ''
  if (!gi.country.iso_code) return ''
  return gi.country.iso_code
}

function get_country_lite (gi) {
  if (gi.countryCode) return gi.countryCode
  if (gi.code) return gi.code
  return ''
}

exports.originating_headers = function (connection) {
  const txn = connection.transaction

  // Try and parse any originating IP headers
  const orig = txn.header.get('x-originating-ip') ||
             txn.header.get('x-ip') ||
             txn.header.get('x-remote-ip')

  if (!orig) return

  const match = net_utils.get_ipany_re('(?:IPv6:)?').exec(orig)
  if (!match) return

  const found_ip = match[1]
  if (net_utils.is_private_ip(found_ip)) return

  const gi = this.get_geoip(found_ip)
  if (!gi) return

  connection.loginfo(this, `originating=${found_ip} ${gi.human}`)
  return `${found_ip}:${get_country(gi)}`
}
