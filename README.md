[![Build Status][ci-img]][ci-url]
[![Windows Build status][ci-win-img]][ci-win-url]
[![Code Climate][clim-img]][clim-url]
[![NPM][npm-img]][npm-url]

# geoip

provide geographic information about mail senders.

# SYNOPSIS

Use MaxMind's GeoIP databases to report geographic information about senders. This plugin uses the [geoip-lite](https://github.com/bluesmoon/node-geoip) node module.

# INSTALL

Install the npm geoip module you prefer:

    npm install -g geoip-lite


# DESCRIPTION

GeoIP results are stored in connection.notes.geoip and the [haraka-results][3] object at `connection.results.geoip`. The following information is typically available:

    continent: NA,
    country:   US,

If the GeoIP city database is available, the following may also be available:

    region:   CA,
    city:     San Francisco,
    ll:       [37.7484, -122.4156],
    distance: 1539    // in kilometers
    range:    [ 3479299040, 3479299071 ],

`geoip` also adds entries like this to your logs:

    [geoip] US
    [geoip] US, WA
    [geoip] US, WA, Seattle
    [geoip] US, WA, Seattle, 1319km

Calculating the distance requires the public IP of this mail server. This may
be the IP that Haraka is bound to. If not, make sure that `haraka-net-utils.get_public_ip`
can figure it out (via STUN or in `smtp.ini`).

# CONFIG

- distance

Performs geodesic distance calculations. Calculates the distance "as the
crow flies" from the remote mail server.

This calculation requires a 'from' IP address. This will typically be the
public IP of your mail server. If Haraka is bound to a private IP, net\_utils
will attempt to determine your public IP. If that doesn't work, edit
config/smtp.ini and set `public_ip`.

- show\_city

show city data in logs and headers. City data is less accurate than country.

- show\_region in logs and headers. Regional data are US states, Canadian
  provinces and such.

Set a connection result to true if the distance exceeds this many kilometers.

- too\_far=4000


# SPAM PREDICTION WITH DISTANCE

[Spatio-temporal Network-level Automatic Reputation Engine][4]

    "For ham, 90% of the messages travel about 4,000 km or less. On the
    other hand, for spam, only 28% of messages stay within this range."

Observations in 2014-2016 suggest that geodesic distance continues to be
highly correlated with spam.


# LIMITATIONS

The distance calculations are more concerned with being fast than
accurate.

For distance calculations, the earth is considered a perfect sphere. In
reality, it is not. Accuracy should be within 1%.


# SEE ALSO

- [MaxMind](http://www.maxmind.com/)
- [Databases](http://geolite.maxmind.com/download/geoip/database)


[1]: https://github.com/msimerson/maxmind-geolite-mirror
[2]: https://www.npmjs.com/package/haraka-plugin-geoip-lite
[3]: https://github.com/haraka/haraka-results
[4]: http://www.cc.gatech.edu/~feamster/papers/snare-usenix09.pdf

[ci-img]: https://github.com/haraka/haraka-plugin-geoip/workflows/Plugin%20Tests/badge.svg
[ci-url]: https://github.com/haraka/haraka-plugin-geoip/actions?query=workflow%3A%22Plugin+Tests%22
[ci-win-img]: https://github.com/haraka/haraka-plugin-geoip/workflows/Plugin%20Tests%20-%20Windows/badge.svg
[ci-win-url]: https://github.com/haraka/haraka-plugin-geoip/actions?query=workflow%3A%22Plugin+Tests+-+Windows%22
[clim-img]: https://codeclimate.com/github/haraka/haraka-plugin-geoip/badges/gpa.svg
[clim-url]: https://codeclimate.com/github/haraka/haraka-plugin-geoip
[npm-img]: https://nodei.co/npm/haraka-plugin-geoip.png
[npm-url]: https://www.npmjs.com/package/haraka-plugin-geoip
