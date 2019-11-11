'use strict';

const assert = require('assert')
const path   = require('path')

const fixtures     = require('haraka-test-fixtures');

const Connection   = fixtures.connection;

describe('register', function () {
  beforeEach(function (done) {
    this.plugin = new fixtures.plugin('geoip');
    this.plugin.register().then(() => {
      this.connection = Connection.createConnection();
      done()
    })
  })

  it('config loaded', function (done) {
    assert.ok(this.plugin.cfg);
    assert.ok(this.plugin.cfg.main);
    done();
  })

  it('maxmind loaded', function (done) {
    assert.ok(this.plugin.maxmind);
    done();
  })

  it('maxmind module loads', function (done) {
    const p = this.plugin;
    assert.ok(p.maxmind);
    done();
  })
})

describe('database lookups', function () {
  beforeEach(function (done) {
    this.plugin = new fixtures.plugin('geoip');
    this.plugin.load_geoip_ini();
    this.plugin.cfg.main.dbdir = path.resolve('test','fixtures');
    this.plugin.require_maxmind();
    this.plugin.load_dbs().then(() => {
      this.connection = Connection.createConnection();
      done()
    })
  })

  it('get_geoip_maxmind', function (done) {
    assert.ok(this.plugin.get_geoip_maxmind('192.48.85.146'));
    done()
  })

  describe('lookup_maxmind', function () {
    it('servedby.tnpi.net', function (done) {

      this.connection.remote.ip='192.48.85.146';
      this.plugin.cfg.main.calc_distance=true;

      this.plugin.lookup_maxmind(() => {
        const r = this.connection.results.get('geoip');
        assert.ok(r);
        assert.equal('US', r.country);
        assert.equal('NA', r.continent);
        done();
      }, this.connection);
    })
  })

  describe('get_geoip', function () {
    it('no IP fails', function (done) {
      assert.ok(!this.plugin.get_geoip());
      done();
    })

    it('ipv4 private fails', function (done) {
      assert.ok(!this.plugin.get_geoip('192.168.85.146'));
      done();
    })
  })

  describe('calculate_distance', function () {
    // ServedBy ll: [ 47.6738, -122.3419 ],
    // WMISD  [ 38, -97 ]

    it('seattle to michigan', function (done) {

      this.plugin.cfg.main.calc_distance=true;
      this.plugin.local_ip='192.48.85.146';
      this.connection.remote.ip='199.176.179.3';
      delete this.plugin.local_geoip;
      this.plugin.calculate_distance(
        this.connection, [38, -97], (err, d) => {
          if (err) console.error(err);
          assert.ok(d > 50 && d < 4000);
          done();
        })
    })

    it('congo to china', function (done) {

      this.plugin.cfg.main.calc_distance=true;
      this.plugin.local_ip='41.78.192.1';
      this.connection.remote.ip='60.168.181.159';
      delete this.plugin.local_geoip;
      this.plugin.calculate_distance(
        this.connection, [38, -97], (err, d) => {
          if (err) console.error(err);
          assert.ok(d > 10000);
          done();
        });
    })
  })

  describe('haversine', function () {
    it('WA to MI is 2000-2500km', function (done) {
      const r = this.plugin.haversine(47.673, -122.3419, 38, -97);
      assert.equal(true, (r > 2000), r);
      assert.equal(true, (r < 2500), r);
      done();
    })
    it('DRC to China is 7,000-15,000km', function (done) {
      const r = this.plugin.haversine(0, 25, 32, 117);
      assert.equal(true, (r > 10000), r);
      assert.equal(true, (r < 15000), r);
      done();
    })
  })
})

describe('get_geoip_maxmind', function () {
  beforeEach(function (done) {
    this.plugin = new fixtures.plugin('geoip');
    this.plugin.load_geoip_ini();
    this.plugin.cfg.main.dbdir = path.resolve('test','fixtures');
    this.plugin.require_maxmind();
    this.plugin.load_dbs().then(() => {
      this.connection = Connection.createConnection();
      done()
    })
  })

  it('ipv4 public passes', function (done) {
    const r = this.plugin.get_geoip_maxmind('192.48.85.146');
    assert.equal(r.country.iso_code, 'US');
    done();
  })

  it('ipv6 public passes', function (done) {
    const r = this.plugin.get_geoip_maxmind('2607:f060:b008:feed::6');
    assert.equal(r.country.iso_code, 'US');
    done();
  })
})
