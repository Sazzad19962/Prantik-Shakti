'use strict';

const { JsonStore } = require('./json-store');
const { MongoStore } = require('./mongo-store');

function createStore(config) {
  if (config.mongoUri) return new MongoStore(config.mongoUri, config.mongoDb);
  return new JsonStore(config.dataDir);
}

module.exports = { createStore, JsonStore, MongoStore };
