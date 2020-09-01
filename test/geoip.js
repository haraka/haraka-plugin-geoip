'use strict';

const assert       = require('assert')

const fixtures     = require('haraka-test-fixtures');

const Connection   = fixtures.connection;

function _set_up (done) {
  this.plugin = new fixtures.plugin('../index');
  this.plugin.load_geoip_ini();
  this.connection = Connection.createConnection();
  done();
}

describe('register', function () {
  beforeEach(function (done) {
    this.plugin = new fixtures.plugin('../index');
    this.plugin.register();
    done()
  })

  it('loads config', function (done) {
    assert.ok(this.plugin.cfg)
    assert.ok(this.plugin.cfg.main)
    done()
  })

  it('geoip-lite module loads if installed', function (done) {
    if (this.plugin.load_geoip_lite()) {
      assert.ok(this.geoip);
    }
    done();
  })
})

// ServedBy ll: [ 47.6738, -122.3419 ],
// WMISD  [ 38, -97 ]

describe('get_geoip', function () {
  beforeEach(function (done) {
    this.plugin = new fixtures.plugin('../index');
    this.plugin.register();
    done()
  })

  it('no IP fails', function (done) {
    assert.ok(!this.plugin.get_geoip());
    done();
  })
  it('ipv4 private fails', function (done) {
    assert.ok(!this.plugin.get_geoip('192.168.85.146'));
    done();
  })
})

describe('lookup_geoip_lite', function () {

  beforeEach(function (done) {
    this.plugin = new fixtures.plugin('../index');
    this.plugin.load_geoip_ini();
    this.connection = Connection.createConnection();
    this.plugin.load_geoip_lite();
    done();
  })


  it.skip('seattle: lat + long', function (done) {
    // lookup fails with Lite
    this.connection.remote.ip='192.48.85.146';
    this.plugin.lookup_geoip_lite((rc) => {
      if (this.plugin.geoip) {
        const r = this.connection.results.get('../index');
        assert.equal(47.6738, r.ll[0]);
        assert.equal(-122.3419, r.ll[1]);
        assert.ok(r);
      }
      done();
    }, this.connection);
  })

  it('michigan: lat + long', function (done) {
    this.connection.remote.ip='199.176.179.3';
    this.plugin.lookup_geoip_lite((rc) => {
      if (this.plugin.geoip) {
        const r = this.connection.results.get('../index');
        assert.equal(44.2504, r.ll[0]);
        assert.equal(-85.43, r.ll[1]);
        assert.ok(r);
      }
      done();
    }, this.connection);
  })
})

describe('get_geoip_lite', function () {

  beforeEach(function (done) {
    this.plugin = new fixtures.plugin('geoip');
    this.plugin.load_geoip_ini();
    this.plugin.load_geoip_lite();
    done();
  })

  it('no IP fails', function (done) {
    if (!this.plugin.geoip) {
      this.plugin.logerror("geoip-lite not loaded!");
      return done();
    }
    assert.ok(!this.plugin.get_geoip_lite());
    done();
  })
  it('ipv4 public passes', function (done) {
    if (!this.plugin.geoip) {
      this.plugin.logerror("geoip-lite not loaded!");
      return done();
    }
    assert.ok(this.plugin.get_geoip_lite('192.48.85.146'));
    done();
  })
  it('ipv4 private fails', function (done) {
    if (!this.plugin.geoip) {
      this.plugin.logerror("geoip-lite not loaded!");
      return done();
    }
    assert.ok(!this.plugin.get_geoip_lite('192.168.85.146'));
    done();
  })
})

describe('calculate_distance', function () {

  beforeEach(_set_up);

  it('seattle to michigan', function (done) {
    this.plugin.register();
    if (!this.plugin.db_loaded) return done();

    this.plugin.cfg.main.calc_distance=true;
    this.plugin.local.ip='192.48.85.146';
    this.connection.remote.ip='199.176.179.3';
    this.plugin.calculate_distance(this.connection, [38, -97], (err, d) => {
      assert.ok(d);
      done();
    });
  })
})

describe('haversine', function () {
  beforeEach(_set_up);

  it('WA to MI is 2000-2500km', function (done) {
    const r = this.plugin.haversine(47.673, -122.3419, 38, -97);
    assert.equal(true, (r > 2000));
    assert.equal(true, (r < 2500));
    done();
  })
})
