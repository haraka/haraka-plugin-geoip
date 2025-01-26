# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/).

### Unreleased

### [1.1.1] - 2025-01-26


- doc(CONTRIBUTORS): added
- populate [files] in package.json. Delete .npmignore.
- style: automated formatting with prettier
- dep(eslint): upgrade to v9
- index.received_header: refactor with es6

### [1.1.0] - 2024-04-02

- index: turn off watchForUpdates
- index: reset regex index to zero after each call to exec #58
- deps: bump and pin versions
- ci: add trigger to run tests on PR #60
- test: add received_header #61
- test: use async where possible
- test: remove done when superfluous

### [1.0.17] - 2022-11-14

- dep(node-maxmind): bump to 4.3.8
- ci workflow updates, #56
- ci(codeql): Add workflow for GitHub code scanning, #55

### 1.0.16 - 2022-05-22

- only use 'plugin = this' where needed
- dep(maxmind): 4.1 -> 4.3

### 1.0.15 - 2020-09-03

- revert plugin rename from #44
- update tests to make it easier to sync

### 1.0.14 - 2020-09-01

- fix connection result access since plugin rename #44
- bump maxmind version to 4.1
- wrap city & country lookups in a try

### 1.0.13 - 2020-01-28

- properly continue loop when one of database file missing

### 1.0.12 - 2019-11-10

- bump maxmind to v4
- revert exported arrow functions, they break the plugin
- include DBs and remove test conditionals that masked broken tests

### 1.0.11 - 2019-10-13

- bump maxmind version to 3.1.2
- switch tests from nodeunit to mocha

### 1.0.10 - 2019-07-16

- move from maxmind.openSync to async maxmind.open, #35

### 1.0.9 - 2019-07-09

- drop node 6 testing
- use maxmind v3

### 1.0.8 - 2018-09-03

- add missing 'c' in iso_code.
- safely access country.iso_code

### 1.0.7 - 2018-01-19

- code climate updates #25
- missing iso_code #24
- replace string concatenations with template literals #23
- add tests for latitude == 0, #22
- Fix issue with latitude == 0, #21

### 1.0.6 - 2017-10-21

- fix lookup exception #18
- eslint no-var updates #17
- replace node 4 with node 8 testing #15

### 1.0.5 - 2017-06-16

- compat with eslint 4

### 1.0.4 - 2016-02-07

- aggregate results before emitting
- README link cleanups

[1.0.17]: https://github.com/haraka/haraka-plugin-geoip/releases/tag/1.0.17
[1.1.0]: https://github.com/haraka/haraka-plugin-geoip/releases/tag/1.1.0
[1.1.1]: https://github.com/haraka/haraka-plugin-geoip/releases/tag/v1.1.1
[1.0.16]: https://github.com/haraka/haraka-plugin-geoip/releases/tag/1.0.16
