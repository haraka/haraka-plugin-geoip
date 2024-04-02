'use strict'

const assert       = require('assert')
const path         = require('path')

const fixtures     = require('haraka-test-fixtures')

const plugin_name  = 'geoip'

describe('register', function () {
  beforeEach(function (done) {
    this.plugin = new fixtures.plugin('geoip')
    this.plugin.register().then(done)
  })

  it('config loaded', function (done) {
    assert.ok(this.plugin.cfg)
    assert.ok(this.plugin.cfg.main)
    done()
  })

  if (plugin_name === 'geoip') {
    it('maxmind module loaded', function (done) {
      assert.ok(this.plugin.maxmind)
      done()
    })
  }

  if (plugin_name === 'geoip-lite') {
    it('geoip-lite module loads', function (done) {
      assert.ok(this.plugin.geoip)
      done()
    })
  }
})

describe('database lookups', function () {
  beforeEach(function (done) {
    this.plugin = new fixtures.plugin('geoip')
    this.plugin.register().then(() => {
      this.connection = fixtures.connection.createConnection()
    })

    if (plugin_name === 'geoip') {
      this.plugin.cfg.main.dbdir = path.resolve('test','fixtures')
      this.plugin.load_dbs().then(done)
    }
    else {
      done()
    }
  })

  describe('get_geoip', function () {

    it('no IP fails', function (done) {
      assert.ok(!this.plugin.get_geoip())
      done()
    })

    it('ipv4 private fails', function (done) {
      assert.ok(!this.plugin.get_geoip('192.168.2.3'))
      done()
    })

    it('ipv4 public passes', function (done) {
      const r = this.plugin.get_geoip('192.48.85.146')
      if (plugin_name === 'geoip') {
        assert.equal(r.continent.code,   'NA')
        assert.equal(r.country.iso_code, 'US')
      }
      if (plugin_name === 'geoip-lite') {
        assert.equal(r.country, 'US')
      }
      done()
    })

    if (plugin_name === 'geoip') {
      it('ipv6 public passes', function (done) {
        const r = this.plugin.get_geoip('2607:f060:b008:feed::6')
        assert.equal(r.continent.code,   'NA')
        assert.equal(r.country.iso_code, 'US')
        done()
      })
    }
  })

  describe('lookup', function () {
    this.timeout(4000)
    it('seattle: lat + long', function (done) {
      this.connection.remote.ip='192.48.85.146'
      this.plugin.lookup(() => {
        const r = this.connection.results.get('geoip')
        assert.equal('US', r.country)
        if (r.continent) assert.equal('NA', r.continent)
        done()
      }, this.connection)
    })

    it('michigan: lat + long', function (done) {
      this.connection.remote.ip='199.176.179.3'
      this.plugin.lookup((rc) => {
        const r = this.connection.results.get('geoip')
        assert.equal('US', r.country)
        if (r.continent) assert.equal('NA', r.continent)
        done()
      }, this.connection)
    })
  })

  describe('calculate_distance', function () {
    // ServedBy ll: [ 47.6738, -122.3419 ],
    // WMISD  [ 38, -97 ]

    it('seattle to michigan', function (done) {

      this.plugin.cfg.main.calc_distance=true
      this.plugin.local_ip='192.48.85.146'
      this.connection.remote.ip='199.176.179.3'
      delete this.plugin.local_geoip
      this.plugin.calculate_distance(this.connection, [38, -97], (err, d) => {
        if (err) console.error(err)
        assert.ok(d > 50 && d < 4000)
        done()
      })
    })

    it('congo to china', function (done) {

      this.plugin.cfg.main.calc_distance=true
      this.plugin.local_ip='41.78.192.1'
      this.connection.remote.ip='60.168.181.159'
      delete this.plugin.local_geoip
      this.plugin.calculate_distance(this.connection, [38, -97], (err, d) => {
        if (err) console.error(err)
        assert.ok(d > 10000)
        done()
      })
    })
  })
})

describe('haversine', function () {

  beforeEach(function (done) {
    this.plugin = new fixtures.plugin('geoip')
    done()
  })

  it('WA to MI is 2000-2500km', function (done) {
    const r = this.plugin.haversine(47.673, -122.3419, 38, -97)
    assert.equal((r > 2000), true, r)
    assert.equal((r < 2500), true, r)
    done()
  })

  it('DRC to China is 7,000-15,000km', function (done) {
    const r = this.plugin.haversine(0, 25, 32, 117)
    assert.equal((r > 10000), true, r)
    assert.equal((r < 15000), true, r)
    done()
  })
})

describe('received_headers', function () {

    beforeEach(function (done) {
        this.plugin = new fixtures.plugin('geoip')
        this.plugin.register().then(() => {
            this.connection = fixtures.connection.createConnection()
            this.connection.transaction = fixtures.transaction.createTransaction()
            done()
        })
    })

    it('get 2 headers', function (done) {
        this.connection.transaction.header.add_end('Received', 'from [199.176.179.3]');
        this.connection.transaction.header.add_end('Received', 'from [192.48.85.146]');
        const results = this.plugin.received_headers(this.connection);
        assert.equal(2, results.length);
        done()        
    })
})

