/**
 * Credential Encryption Module
 *
 * Provides secure encryption/decryption for API keys and other sensitive credentials
 * using Node.js crypto module with AES-256-GCM.
 *
 * Security Features:
 * - AES-256-GCM encryption (authenticated encryption)
 * - Random IV per encryption (prevents pattern detection)
 * - Key derived from machine-specific identifier + optional user passphrase
 * - Backward compatibility with plaintext credentials
 */

const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const KEY_ITERATIONS = 100000; // PBKDF2 iterations

/**
 * Get or generate the encryption key
 * Uses a combination of machine identifier and optional passphrase
 * @param {string} passphrase - Optional user passphrase for additional security
 * @returns {Object} Key derivation info
 */
async function getEncryptionKey(passphrase = null) {
  // Get machine-specific identifier
  const machineId = await getMachineIdentifier();

  // Use provided passphrase or machine ID as base
  const secret = passphrase || machineId;

  // Generate a consistent salt from machine ID
  const salt = crypto.createHash('sha256')
    .update(`codeswarm-salt-${machineId}`)
    .digest()
    .slice(0, SALT_LENGTH);

  // Derive key using PBKDF2
  const key = crypto.pbkdf2Sync(
    secret,
    salt,
    KEY_ITERATIONS,
    32, // 256 bits
    'sha256'
  );

  return { key, salt };
}

/**
 * Get a machine-specific identifier
 * Combines hostname, platform, and homedir for uniqueness
 * @returns {string} Machine identifier
 */
async function getMachineIdentifier() {
  const hostname = os.hostname();
  const platform = os.platform();
  const homedir = os.homedir();
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown';

  // Create a hash from machine characteristics
  const identifier = `${hostname}:${platform}:${homedir}:${cpuModel}`;
  return crypto.createHash('sha256').update(identifier).digest('hex');
}

/**
 * Encrypt a plaintext string
 * @param {string} plaintext - The text to encrypt
 * @param {string} passphrase - Optional passphrase for additional security
 * @returns {string} Encrypted string (base64 encoded with IV and auth tag)
 */
function encrypt(plaintext, passphrase = null) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }

  // Get encryption key synchronously for encryption
  const machineId = getMachineIdentifierSync();
  const secret = passphrase || machineId;

  const salt = crypto.createHash('sha256')
    .update(`codeswarm-salt-${machineId}`)
    .digest()
    .slice(0, SALT_LENGTH);

  const key = crypto.pbkdf2Sync(secret, salt, KEY_ITERATIONS, 32, 'sha256');

  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  // Encrypt
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Combine IV + auth tag + encrypted data
  // Format: iv:authTag:encrypted (all base64)
  const result = [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted
  ].join(':');

  // Prefix with marker for identification
  return `enc:${result}`;
}

/**
 * Decrypt an encrypted string
 * @param {string} encryptedData - The encrypted string (with enc: prefix)
 * @param {string} passphrase - Optional passphrase (must match encryption)
 * @returns {string} Decrypted plaintext
 */
function decrypt(encryptedData, passphrase = null) {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Encrypted data must be a non-empty string');
  }

  // Check for encryption marker
  if (!encryptedData.startsWith('enc:')) {
    // Not encrypted, return as-is (backward compatibility)
    return encryptedData;
  }

  // Remove prefix
  const data = encryptedData.slice(4);

  // Parse components
  const parts = data.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivBase64, authTagBase64, encrypted] = parts;

  // Decode components
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  // Get decryption key
  const machineId = getMachineIdentifierSync();
  const secret = passphrase || machineId;

  const salt = crypto.createHash('sha256')
    .update(`codeswarm-salt-${machineId}`)
    .digest()
    .slice(0, SALT_LENGTH);

  const key = crypto.pbkdf2Sync(secret, salt, KEY_ITERATIONS, 32, 'sha256');

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  // Set authentication tag
  decipher.setAuthTag(authTag);

  // Decrypt
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if a value is encrypted
 * @param {string} value - Value to check
 * @returns {boolean} True if encrypted
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith('enc:');
}

/**
 * Encrypt an API key for storage
 * @param {string} apiKey - Plain API key
 * @returns {string} Encrypted API key
 */
function encryptApiKey(apiKey) {
  return encrypt(apiKey);
}

/**
 * Decrypt an API key from storage
 * @param {string} storedValue - Stored value (may be encrypted or plaintext)
 * @returns {string} Decrypted API key
 */
function decryptApiKey(storedValue) {
  if (!storedValue) {
    return storedValue;
  }

  // If encrypted, decrypt it
  if (isEncrypted(storedValue)) {
    return decrypt(storedValue);
  }

  // Otherwise return as-is (plaintext for backward compatibility)
  return storedValue;
}

/**
 * Get machine identifier synchronously
 * @returns {string} Machine identifier hash
 */
function getMachineIdentifierSync() {
  const hostname = os.hostname();
  const platform = os.platform();
  const homedir = os.homedir();
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown';

  const identifier = `${hostname}:${platform}:${homedir}:${cpuModel}`;
  return crypto.createHash('sha256').update(identifier).digest('hex');
}

/**
 * Encrypt all API keys in a config object
 * @param {Object} config - Config object with providers
 * @returns {Object} Config with encrypted API keys
 */
function encryptConfig(config) {
  if (!config || !config.llm?.providers) {
    return config;
  }

  const encrypted = JSON.parse(JSON.stringify(config));

  for (const [name, provider] of Object.entries(encrypted.llm.providers)) {
    if (provider.api_key && !isEncrypted(provider.api_key)) {
      provider.api_key = encryptApiKey(provider.api_key);
      provider._encrypted = true; // Mark as encrypted
    }
  }

  return encrypted;
}

/**
 * Decrypt all API keys in a config object
 * @param {Object} config - Config object with encrypted providers
 * @returns {Object} Config with decrypted API keys
 */
function decryptConfig(config) {
  if (!config || !config.llm?.providers) {
    return config;
  }

  const decrypted = JSON.parse(JSON.stringify(config));

  for (const [name, provider] of Object.entries(decrypted.llm.providers)) {
    if (provider.api_key) {
      provider.api_key = decryptApiKey(provider.api_key);
    }
    // Remove encryption marker
    delete provider._encrypted;
  }

  return decrypted;
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  encryptApiKey,
  decryptApiKey,
  encryptConfig,
  decryptConfig,
  getMachineIdentifier,
  getMachineIdentifierSync
};
