// services/tokenService.js
const redis = require('redis');
const { promisify } = require('util');
const speakeasy = require('speakeasy');

class TokenService {
  constructor() {
    this.client = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    this.client.on('error', (err) => {
      console.error('Redis error:', err);
    });
    
    this.client.connect();
    
    // Promisify Redis methods
    this.setex = promisify(this.client.setex).bind(this.client);
    this.get = promisify(this.client.get).bind(this.client);
    this.del = promisify(this.client.del).bind(this.client);
    this.exists = promisify(this.client.exists).bind(this.client);
  }
  
  // Blacklist token
  async blacklistToken(token, expiresIn = 24 * 60 * 60) {
    const key = `blacklist:${token}`;
    await this.setex(key, expiresIn, 'true');
  }
  
  // Check if token is blacklisted
  async isTokenBlacklisted(token) {
    const key = `blacklist:${token}`;
    const result = await this.exists(key);
    return result === 1;
  }
  
  // Store refresh token
  async storeRefreshToken(userId, token, expiresIn = 7 * 24 * 60 * 60) {
    const key = `refresh:${userId}`;
    await this.setex(key, expiresIn, token);
  }
  
  // Get refresh token
  async getRefreshToken(userId) {
    const key = `refresh:${userId}`;
    return await this.get(key);
  }
  
  // Delete refresh token
  async deleteRefreshToken(userId) {
    const key = `refresh:${userId}`;
    await this.del(key);
  }
  
  // Store password reset token
  async storePasswordResetToken(userId, token, expiresIn = 30 * 60) {
    const key = `reset:${userId}`;
    await this.setex(key, expiresIn, token);
  }
  
  // Verify password reset token
  async verifyPasswordResetToken(userId, token) {
    const key = `reset:${userId}`;
    const storedToken = await this.get(key);
    return storedToken === token;
  }
  
  // Store email verification token
  async storeEmailVerificationToken(email, token, expiresIn = 24 * 60 * 60) {
    const key = `verify:${email}`;
    await this.setex(key, expiresIn, token);
  }
  
  // Verify email verification token
  async verifyEmailVerificationToken(email, token) {
    const key = `verify:${email}`;
    const storedToken = await this.get(key);
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
    await this.setex(key, expiresIn, JSON.stringify(userData));
  }
  
  // Get session
  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }
  
  // Delete session
  async deleteSession(sessionId) {
    const key = `session:${sessionId}`;
    await this.del(key);
  }
  
  // Rate limiting
  async checkRateLimit(identifier, limit = 100, window = 60 * 60) {
    const key = `rate:${identifier}`;
    const current = await this.get(key);
    
    if (!current) {
      await this.setex(key, window, '1');
      return { allowed: true, remaining: limit - 1 };
    }
    
    const count = parseInt(current);
    if (count >= limit) {
      return { allowed: false, remaining: 0 };
    }
    
    await this.client.incr(key);
    return { allowed: true, remaining: limit - count - 1 };
  }
}

module.exports = new TokenService();