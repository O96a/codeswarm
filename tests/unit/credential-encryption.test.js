/**
 * Tests for Credential Encryption Module
 */

const crypto = require('crypto');
const {
  encrypt,
  decrypt,
  isEncrypted,
  encryptApiKey,
  decryptApiKey,
  getMachineIdentifierSync
} = require('../../src/credential-encryption');

describe('Credential Encryption', () => {
  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plaintext = 'my-secret-api-key-12345';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toMatch(/^enc:/);

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'same-input';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      // Both should decrypt to same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);

      // But ciphertexts should be different (due to random IV)
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should throw error for empty plaintext', () => {
      expect(() => encrypt('')).toThrow('Plaintext must be a non-empty string');
      expect(() => encrypt(null)).toThrow('Plaintext must be a non-empty string');
    });

    it('should handle special characters in plaintext', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\'\\';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = '你好世界 🌍 مرحبا';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle very long strings', () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('isEncrypted', () => {
    it('should return true for encrypted strings', () => {
      const encrypted = encrypt('test');
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plaintext strings', () => {
      expect(isEncrypted('plaintext')).toBe(false);
      expect(isEncrypted('sk-12345')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
    });
  });

  describe('encryptApiKey and decryptApiKey', () => {
    it('should encrypt and decrypt API keys', () => {
      const apiKey = 'sk-1234567890abcdef';
      const encrypted = encryptApiKey(apiKey);

      expect(encrypted).toBeDefined();
      expect(encrypted).toMatch(/^enc:/);

      const decrypted = decryptApiKey(encrypted);
      expect(decrypted).toBe(apiKey);
    });

    it('should return null/undefined as-is', () => {
      expect(decryptApiKey(null)).toBeNull();
      expect(decryptApiKey(undefined)).toBeUndefined();
    });

    it('should return plaintext strings as-is (backward compatibility)', () => {
      const plaintext = 'plaintext-api-key';
      expect(decryptApiKey(plaintext)).toBe(plaintext);
    });
  });

  describe('getMachineIdentifierSync', () => {
    it('should return a consistent hash', () => {
      const id1 = getMachineIdentifierSync();
      const id2 = getMachineIdentifierSync();

      expect(id1).toBeDefined();
      expect(id1).toBe(id2);
      expect(id1.length).toBe(64); // SHA-256 produces 64 hex characters
    });

    it('should return a valid hex string', () => {
      const id = getMachineIdentifierSync();
      expect(id).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Encryption Format', () => {
    it('should produce correctly formatted output', () => {
      const encrypted = encrypt('test');

      // Format: enc:iv:authTag:ciphertext (all base64)
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe('enc');

      // Each part should be valid base64
      for (let i = 1; i < parts.length; i++) {
        expect(() => Buffer.from(parts[i], 'base64')).not.toThrow();
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid encrypted data format', () => {
      expect(() => decrypt('enc:invalid')).toThrow('Invalid encrypted data format');
    });

    it('should throw error for tampered auth tag', () => {
      const encrypted = encrypt('test');
      const parts = encrypted.split(':');

      // Tamper with auth tag
      const tampered = `${parts[0]}:${parts[1]}:${Buffer.from('tampered').toString('base64')}:${parts[3]}`;

      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw error for tampered ciphertext', () => {
      const encrypted = encrypt('test');
      const parts = encrypted.split(':');

      // Tamper with ciphertext
      const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${Buffer.from('tampered').toString('base64')}`;

      expect(() => decrypt(tampered)).toThrow();
    });
  });
});
