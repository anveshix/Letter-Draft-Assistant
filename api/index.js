'use strict';

const { handler } = require('../server.js');

module.exports = (req, res) => handler(req, res);
module.exports.config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
