// services/tokenService.js
const speakeasy = require('speakeasy');

class TokenService {
  constructor() {
    // In-memory storage for development
    // Replace with Redis in production
    this.storage = new Map();
    
    // Clean up expired tokens every hour
    setInterval(() => this.cleanupExpired(), 60 * 60 * 1000);
  }
  
  // Helper to create key with expiration
  setWithExpiry(key, value, ttlSeconds) {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.storage.set(key, { value, expiresAt });
  }
  
  // Helper to get value if not expired
  getIfNotExpired(key) {
    const item = this.storage.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiresAt) {
      this.storage.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  // Clean up expired entries
  cleanupExpired() {
    const now = Date.now();
    for (const [key, item] of this.storage.entries()) {
      if (now > item.expiresAt) {
        this.storage.delete(key);
      }
    }
  }
  
  // Blacklist token
  async blacklistToken(token, expiresIn = 24 * 60 * 60) {
    const key = `blacklist:${token}`;
    this.setWithExpiry(key, 'true', expiresIn);
  }
  
  // Check if token is blacklisted
  async isTokenBlacklisted(token) {
    const key = `blacklist:${token}`;
    return this.getIfNotExpired(key) === 'true';
  }
  
  // Store refresh token
  async storeRefreshToken(userId, token, expiresIn = 7 * 24 * 60 * 60) {
    const key = `refresh:${userId}`;
    this.setWithExpiry(key, token, expiresIn);
  }
  
  // Get refresh token
  async getRefreshToken(userId) {
    const key = `refresh:${userId}`;
    return this.getIfNotExpired(key);
  }
  
  // Delete refresh token
  async deleteRefreshToken(userId) {
    const key = `refresh:${userId}`;
    this.storage.delete(key);
  }
  
  // Store password reset token
  async storePasswordResetToken(userId, token, expiresIn = 30 * 60) {
    const key = `reset:${userId}`;
    this.setWithExpiry(key, token, expiresIn);
  }
  
  // Verify password reset token
  async verifyPasswordResetToken(userId, token) {
    const key = `reset:${userId}`;
    const storedToken = this.getIfNotExpired(key);
    return storedToken === token;
  }
  
  // Store email verification token
  async storeEmailVerificationToken(email, token, expiresIn = 24 * 60 * 60) {
    const key = `verify:${email}`;
    this.setWithExpiry(key, token, expiresIn);
  }
  
  // Verify email verification token
  async verifyEmailVerificationToken(email, token) {
    const key = `verify:${email}`;
    const storedToken = this.getIfNotExpired(key);
    return storedToken === token;
  }
  
  // Generate 2FA secret
  generate2FASecret(email) {
    return speakeasy.generateSecret({
      name: `ATS Platform (${email})`,
      length: 32
    });
  }
  
  // Verify 2FA token
  verify2FAToken(user, token) {
    return speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1
    });
  }
  
  // Store session
  async storeSession(sessionId, userData, expiresIn = 24 * 60 * 60) {
    const key = `session:${sessionId}`;
    this.setWithExpiry(key, JSON.stringify(userData), expiresIn);
  }
  
  // Get session
  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    const data = this.getIfNotExpired(key);
    return data ? JSON.parse(data) : null;
  }
  
  // Delete session
  async deleteSession(sessionId) {
    const key = `session:${sessionId}`;
    this.storage.delete(key);
  }
  
  // Rate limiting
  async checkRateLimit(identifier, limit = 100, window = 60 * 60) {
    const key = `rate:${identifier}`;
    const windowKey = `${key}:window`;
    
    // Get current window start time
    const windowStart = this.getIfNotExpired(windowKey);
    const now = Date.now();
    
    // If window has expired or doesn't exist, start a new one
    if (!windowStart || now - parseInt(windowStart) > window * 1000) {
      this.setWithExpiry(windowKey, now.toString(), window);
      this.setWithExpiry(key, '1', window);
      return { allowed: true, remaining: limit - 1 };
    }
    
    // Get current count
    const currentCount = parseInt(this.getIfNotExpired(key) || '0');
    
    if (currentCount >= limit) {
      return { allowed: false, remaining: 0 };
    }
    
    // Increment count
    this.setWithExpiry(key, (currentCount + 1).toString(), window);
    return { allowed: true, remaining: limit - currentCount - 1 };
  }
}

module.exports = new TokenService();