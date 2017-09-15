'use strict';

const fixtures     = require('haraka-test-fixtures');

const Connection   = fixtures.connection;

const _set_up = function (done) {
  this.plugin = new fixtures.plugin('geoip');
  this.plugin.register();
  this.connection = Connection.createConnection();
  done();
};

exports.register = {
  setUp : function (done) {
    this.plugin = new fixtures.plugin('geoip');
    this.plugin.register();
    done();
  },
  'config loaded': function (test) {
    test.expect(2);
    test.ok(this.plugin.cfg);
    test.ok(this.plugin.cfg.main);
    test.done();
  },
  'maxmind loaded': function (test) {
    if (this.plugin.mm_loads) {
      test.expect(1);
      test.ok(this.plugin.maxmind);
    }
    test.done();
  },
};

exports.load_maxmind = {
  setUp : _set_up,
  'maxmind module loads if installed': function (test) {
    const p = this.plugin;
    if (this.plugin.load_maxmind()) {
      test.expect(1);
      test.ok(p.maxmind);
    }
    test.done();
  },
};

exports.lookup_maxmind = {
  setUp : _set_up,
  'servedby.tnpi.net': function (test) {
    const cb = function () {
      if (this.plugin.maxmind && this.plugin.dbsLoaded) {
        test.expect(2);
        const r = this.connection.results.get('geoip');
        test.equal('US', r.country);
        test.equal('NA', r.continent);
      }
      test.done();
    }.bind(this);

    this.connection.remote.ip='192.48.85.146';
    this.plugin.cfg.main.calc_distance=true;
    this.plugin.lookup_maxmind(cb, this.connection);
  },
};

// // ServedBy ll: [ 47.6738, -122.3419 ],
// // WMISD  [ 38, -97 ]

exports.get_geoip = {
  setUp : function (done) {
    this.plugin = new fixtures.plugin('geoip');
    this.plugin.register();
    done();
  },
  'no IP fails': function (test) {
    if (!this.plugin.hasProvider) { return test.done(); }
    test.expect(1);
    test.ok(!this.plugin.get_geoip());
    test.done();
  },
  'ipv4 private fails': function (test) {
    if (!this.plugin.hasProvider) { return test.done(); }
    test.expect(1);
    test.ok(!this.plugin.get_geoip('192.168.85.146'));
    test.done();
  },
};

exports.get_geoip_maxmind = {
  setUp : function (done) {
    this.plugin = new fixtures.plugin('geoip');
    this.plugin.load_geoip_ini();
    const p = this.plugin;
    this.plugin.load_maxmind();
    if (!p.maxmind) {
      p.logerror("maxmind not loaded!");
      return done();
    }
    if (!p.dbsLoaded) {
      p.logerror("no maxmind DBs loaded!");
    }
    done();
  },
  'ipv4 public passes': function (test) {
    if (!this.plugin.maxmind) { return test.done(); }
    if (!this.plugin.dbsLoaded) { return test.done(); }
    test.expect(1);
    test.ok(this.plugin.get_geoip_maxmind('192.48.85.146'));
    test.done();
  },
  'ipv6 public passes': function (test) {
    if (!this.plugin.maxmind) { return test.done(); }
    if (!this.plugin.dbsLoaded) { return test.done(); }
    test.expect(1);
    const r = this.plugin.get_geoip_maxmind('2607:f060:b008:feed::6');
    test.ok(r);
    test.done();
  },
};

exports.calculate_distance = {
  setUp : _set_up,
  'seattle to michigan': function (test) {
    this.plugin.register();
    if (!this.plugin.db_loaded) {
      return test.done();
    }
    this.plugin.cfg.main.calc_distance=true;
    this.plugin.local.ip='192.48.85.146';
    this.connection.remote.ip='199.176.179.3';
    this.plugin.calculate_distance(
      this.connection,
      [38, -97],
      function (err, d) {
        if (err) console.error(err);
        test.expect(1);
        test.ok(d);
        test.done();
      });
  },
};

exports.haversine = {
  setUp : _set_up,
  'WA to MI is 2000-2500km': function (test) {
    test.expect(2);
    const r = this.plugin.haversine(47.673, -122.3419, 38, -97);
    test.equal(true, (r > 2000), r);
    test.equal(true, (r < 2500), r);
    test.done();
  },
};
