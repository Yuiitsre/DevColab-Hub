'use strict';
// Socket.io configuration is applied inline in server.js.
// This module just exports the shared options for reference.

module.exports = {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
};
