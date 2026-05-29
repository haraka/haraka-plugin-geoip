'use strict'

const assert = require('node:assert')
const path = require('node:path')
const { beforeEach, describe, it } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')

const plugin_name = 'geoip'

let plugin
let connection

beforeEach(async () => {
  plugin = makePlugin('geoip', { register: false })

  // replace vm-compiled functions with instrumented versions for coverage tracking
  if (process.env.HARAKA_COVERAGE) {
    const plugin_module = require('../index.js')
    Object.assign(plugin, plugin_module)
  }

  await plugin.register()

  connection = makeConnection({ withTxn: true })
})

describe('register', () => {
  it('config loaded', () => {
    assert.ok(plugin.cfg)
    assert.ok(plugin.cfg.main)
  })

  if (plugin_name === 'geoip') {
    it('maxmind module loaded', () => {
      assert.ok(plugin.maxmind)
    })
  }

  if (plugin_name === 'geoip-lite') {
    it('geoip-lite module loads', () => {
      assert.ok(plugin.geoip)
    })
  }
})

describe('database lookups', () => {
  beforeEach(async () => {
    if (plugin_name === 'geoip') {
      plugin.cfg.main.dbdir = path.resolve('test', 'fixtures')
      await plugin.load_dbs()
    }
  })

  describe('get_geoip', () => {
    it('no IP fails', () => {
      assert.ok(!plugin.get_geoip())
    })

    it('ipv4 private fails', () => {
      assert.ok(!plugin.get_geoip('192.168.2.3'))
    })

    it('ipv4 public passes', () => {
      const r = plugin.get_geoip('192.48.85.146')
      if (plugin_name === 'geoip') {
        assert.equal(r.continent.code, 'NA')
        assert.equal(r.country.iso_code, 'US')
      }
      if (plugin_name === 'geoip-lite') {
        assert.equal(r.country, 'US')
      }
    })

    if (plugin_name === 'geoip') {
      it('ipv6 public passes', () => {
        const r = plugin.get_geoip('2607:f060:b008:feed::6')
        assert.equal(r.continent.code, 'NA')
        assert.equal(r.country.iso_code, 'US')
      })
    }
  })

  describe('lookup', { timeout: 4000 }, () => {
    it('seattle: lat + long', async () => {
      connection.remote.ip = '192.48.85.146'
      await new Promise((resolve) => {
        plugin.lookup(() => {
          const r = connection.results.get('geoip')
          assert.equal('US', r.country)
          if (r.continent) assert.equal('NA', r.continent)
          resolve()
        }, connection)
      })
    })

    it('michigan: lat + long', async () => {
      connection.remote.ip = '199.176.179.3'
      await new Promise((resolve) => {
        plugin.lookup(() => {
          const r = connection.results.get('geoip')
          assert.equal('US', r.country)
          if (r.continent) assert.equal('NA', r.continent)
          resolve()
        }, connection)
      })
    })
  })

  describe('calculate_distance', () => {
    // ServedBy ll: [ 47.6738, -122.3419 ],
    // WMISD  [ 38, -97 ]

    it('seattle to michigan', async () => {
      plugin.cfg.main.calc_distance = true
      plugin.local_ip = '192.48.85.146'
      connection.remote.ip = '199.176.179.3'
      delete plugin.local_geoip
      await new Promise((resolve) => {
        plugin.calculate_distance(connection, [38, -97], (err, d) => {
          if (err) console.error(err)
          assert.ok(d > 50 && d < 4000)
          resolve()
        })
      })
    })

    it('congo to china', async () => {
      plugin.cfg.main.calc_distance = true
      plugin.local_ip = '41.78.192.1'
      connection.remote.ip = '60.168.181.159'
      delete plugin.local_geoip
      await new Promise((resolve) => {
        plugin.calculate_distance(connection, [38, -97], (err, d) => {
          if (err) console.error(err)
          assert.ok(d > 10000)
          resolve()
        })
      })
    })
  })
})

describe('haversine', () => {
  it('WA to MI is 2000-2500km', () => {
    const r = plugin.haversine(47.673, -122.3419, 38, -97)
    assert.equal(r > 2000, true, r)
    assert.equal(r < 2500, true, r)
  })

  it('DRC to China is 7,000-15,000km', () => {
    const r = plugin.haversine(0, 25, 32, 117)
    assert.equal(r > 10000, true, r)
    assert.equal(r < 15000, true, r)
  })
})

describe('received_headers', () => {
  beforeEach(async () => {
    if (plugin_name === 'geoip') {
      plugin.cfg.main.dbdir = path.resolve('test', 'fixtures')
      await plugin.load_dbs()
    }
  })

  it('generates results for each received header', () => {
    connection.transaction.header.add_end('Received', 'from [199.176.179.3]')
    connection.transaction.header.add_end('Received', 'from [192.48.85.146]')
    const results = plugin.received_headers(connection)
    assert.equal(results.length, 2)
  })
})
