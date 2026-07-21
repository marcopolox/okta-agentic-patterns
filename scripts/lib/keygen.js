'use strict';

const crypto = require('node:crypto');

function generateRsaJwkPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = crypto.randomUUID();
  const privJwk = privateKey.export({ format: 'jwk' });
  const pubJwk = publicKey.export({ format: 'jwk' });
  return {
    privateJwk: { ...privJwk, alg: 'RS256', use: 'sig', kid },
    publicJwk: { ...pubJwk, alg: 'RS256', use: 'sig', kid },
  };
}

module.exports = { generateRsaJwkPair };
