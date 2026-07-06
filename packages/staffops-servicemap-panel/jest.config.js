// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const baseConfig = require('./.config/jest.config');
const { nodeModulesToTransform, grafanaESModules } = require('./.config/jest/utils');

// d3-force depends on d3-quadtree, d3-dispatch, d3-timer which are ESM-only
const additionalESModules = [
  'd3-quadtree',
  'd3-dispatch',
  'd3-timer',
];

module.exports = {
  ...baseConfig,
  transformIgnorePatterns: [
    nodeModulesToTransform([...grafanaESModules, ...additionalESModules]),
  ],
};
