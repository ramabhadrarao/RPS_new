// services/tokenService.js
const speakeasy = require('speakeasy');
const crypto = require('crypto');

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
  
  // Hash token for secure storage
  hashToken(token) {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }
  
  // ============ TOKEN BLACKLISTING ============
  
  // Blacklist token with automatic expiration
  async blacklistToken(token, expiresIn = 24 * 60 * 60) {
    const tokenHash = this.hashToken(token);
    const key = `blacklist:${tokenHash}`;
    
    this.setWithExpiry(key, {
      blacklistedAt: new Date(),
      reason: 'logout',
      tokenPreview: token.substring(0, 10) + '...' // For debugging
    }, expiresIn);
    
    console.log(`Token blacklisted for ${expiresIn} seconds`);
  }
  
  // Check if token is blacklisted
  async isTokenBlacklisted(token) {
    const tokenHash = this.hashToken(token);
    const key = `blacklist:${tokenHash}`;
    const blacklistEntry = this.getIfNotExpired(key);
    
    return blacklistEntry !== null;
  }
  
  // Invalidate all tokens for a user
  async invalidateAllUserTokens(userId) {
    const key = `user_blacklist:${userId}`;
    const blacklistUntil = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
    
    this.setWithExpiry(key, {
      blacklistedAt: new Date(),
      until: new Date(blacklistUntil),
      reason: 'security_event'
    }, 7 * 24 * 60 * 60);
  }
  
  // Check if user's tokens are blacklisted
  async areUserTokensBlacklisted(userId) {
    const key = `user_blacklist:${userId}`;
    const blacklistEntry = this.getIfNotExpired(key);
    
    if (blacklistEntry && new Date(blacklistEntry.until) > new Date()) {
      return true;
    }
    
    return false;
  }
  
  // ============ REFRESH TOKENS ============
  
  // Store refresh token
  async storeRefreshToken(userId, token, expiresIn = 7 * 24 * 60 * 60) {
    const key = `refresh:${userId}`;
    const tokenHash = this.hashToken(token);
    
    this.setWithExpiry(key, {
      token: tokenHash,
      createdAt: new Date(),
      lastUsed: new Date()
    }, expiresIn);
  }
  
  // Get refresh token
  async getRefreshToken(userId) {
    const key = `refresh:${userId}`;
    const tokenData = this.getIfNotExpired(key);
    return tokenData;
  }
  
  // Validate refresh token
  async validateRefreshToken(userId, token) {
    const storedData = await this.getRefreshToken(userId);
    if (!storedData) return false;
    
    const tokenHash = this.hashToken(token);
    return storedData.token === tokenHash;
  }
  
  // Delete refresh token
  async deleteRefreshToken(userId) {
    const key = `refresh:${userId}`;
    this.storage.delete(key);
  }
  
  // Update refresh token last used
  async updateRefreshTokenUsage(userId) {
    const key = `refresh:${userId}`;
    const tokenData = this.getIfNotExpired(key);
    
    if (tokenData) {
      tokenData.lastUsed = new Date();
      const item = this.storage.get(key);
      if (item) {
        item.value = tokenData;
        this.storage.set(key, item);
      }
    }
  }
  
  // ============ SESSION MANAGEMENT ============
  
  // Store session with device info
  async storeSession(sessionId, sessionData, expiresIn = 24 * 60 * 60) {
    const key = `session:${sessionId}`;
    
    this.setWithExpiry(key, {
      ...sessionData,
      sessionId,
      createdAt: new Date(),
      lastActive: new Date()
    }, expiresIn);
    
    // Also store session ID by user for easy lookup
    await this.addUserSession(sessionData.userId, sessionId);
  }
  
  // Add session to user's session list
  async addUserSession(userId, sessionId) {
    const key = `user_sessions:${userId}`;
    const sessions = this.getIfNotExpired(key) || [];
    
    if (!sessions.includes(sessionId)) {
      sessions.push(sessionId);
      this.setWithExpiry(key, sessions, 7 * 24 * 60 * 60); // 7 days
    }
  }
  
  // Get session data
  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    return this.getIfNotExpired(key);
  }
  
  // Update session activity
  async updateSessionActivity(sessionId) {
    const session = await this.getSession(sessionId);
    if (session) {
      session.lastActive = new Date();
      const key = `session:${sessionId}`;
      const item = this.storage.get(key);
      if (item) {
        item.value = session;
        this.storage.set(key, item);
      }
    }
  }
  
  // Delete session
  async deleteSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (session) {
      // Remove from user's session list
      await this.removeUserSession(session.userId, sessionId);
    }
    
    const key = `session:${sessionId}`;
    this.storage.delete(key);
  }
  
  // Remove session from user's list
  async removeUserSession(userId, sessionId) {
    const key = `user_sessions:${userId}`;
    const sessions = this.getIfNotExpired(key) || [];
    
    const filteredSessions = sessions.filter(id => id !== sessionId);
    if (filteredSessions.length > 0) {
      this.setWithExpiry(key, filteredSessions, 7 * 24 * 60 * 60);
    } else {
      this.storage.delete(key);
    }
  }
  
  // Get all sessions for a user
  async getUserSessions(userId) {
    const key = `user_sessions:${userId}`;
    const sessionIds = this.getIfNotExpired(key) || [];
    const sessions = [];
    
    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session) {
        sessions.push(session);
      }
    }
    
    return sessions;
  }
  
  // Delete all sessions for a user
  async deleteAllUserSessions(userId) {
    const sessions = await this.getUserSessions(userId);
    
    for (const session of sessions) {
      await this.deleteSession(session.sessionId);
    }
    
    const key = `user_sessions:${userId}`;
    this.storage.delete(key);
  }
  
  // Logout from all devices
  async logoutAllDevices(userId) {
    // Invalidate all tokens
    await this.invalidateAllUserTokens(userId);
    
    // Delete refresh token
    await this.deleteRefreshToken(userId);
    
    // Delete all sessions
    await this.deleteAllUserSessions(userId);
  }
  
  // ============ PASSWORD RESET TOKENS ============
  
  // Store password reset token
  async storePasswordResetToken(userId, token, expiresIn = 30 * 60) {
    const key = `reset:${userId}`;
    const tokenHash = this.hashToken(token);
    
    this.setWithExpiry(key, {
      token: tokenHash,
      createdAt: new Date(),
      attempts: 0
    }, expiresIn);
  }
  
  // Verify password reset token
  async verifyPasswordResetToken(userId, token) {
    const key = `reset:${userId}`;
    const storedData = this.getIfNotExpired(key);
    
    if (!storedData) return false;
    
    // Check attempts (prevent brute force)
    if (storedData.attempts >= 5) {
      this.storage.delete(key);
      return false;
    }
    
    const tokenHash = this.hashToken(token);
    const isValid = storedData.token === tokenHash;
    
    if (!isValid) {
      // Increment attempts
      storedData.attempts += 1;
      const item = this.storage.get(key);
      if (item) {
        item.value = storedData;
        this.storage.set(key, item);
      }
    }
    
    return isValid;
  }
  
  // Delete password reset token
  async deletePasswordResetToken(userId) {
    const key = `reset:${userId}`;
    this.storage.delete(key);
  }
  
  // ============ EMAIL VERIFICATION TOKENS ============
  
  // Store email verification token
  async storeEmailVerificationToken(email, token, expiresIn = 24 * 60 * 60) {
    const key = `verify:${email.toLowerCase()}`;
    const tokenHash = this.hashToken(token);
    
    this.setWithExpiry(key, {
      token: tokenHash,
      createdAt: new Date()
    }, expiresIn);
  }
  
  // Verify email verification token
  async verifyEmailVerificationToken(email, token) {
    const key = `verify:${email.toLowerCase()}`;
    const storedData = this.getIfNotExpired(key);
    
    if (!storedData) return false;
    
    const tokenHash = this.hashToken(token);
    return storedData.token === tokenHash;
  }
  
  // Delete email verification token
  async deleteEmailVerificationToken(email) {
    const key = `verify:${email.toLowerCase()}`;
    this.storage.delete(key);
  }
  
  // ============ 2FA METHODS ============
  
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
      window: 1 // Allow 1 window before/after for clock skew
    });
  }
  
  // Store 2FA backup codes
  async store2FABackupCodes(userId, codes) {
    const key = `2fa_backup:${userId}`;
    const hashedCodes = codes.map(code => this.hashToken(code));
    
    this.setWithExpiry(key, {
      codes: hashedCodes,
      createdAt: new Date(),
      usedCodes: []
    }, 365 * 24 * 60 * 60); // 1 year
  }
  
  // Verify 2FA backup code
  async verify2FABackupCode(userId, code) {
    const key = `2fa_backup:${userId}`;
    const data = this.getIfNotExpired(key);
    
    if (!data) return false;
    
    const codeHash = this.hashToken(code);
    const isValid = data.codes.includes(codeHash) && !data.usedCodes.includes(codeHash);
    
    if (isValid) {
      // Mark code as used
      data.usedCodes.push(codeHash);
      const item = this.storage.get(key);
      if (item) {
        item.value = data;
        this.storage.set(key, item);
      }
    }
    
    return isValid;
  }
  
  // ============ RATE LIMITING ============
  
  // Check rate limit
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
      return { 
        allowed: true, 
        remaining: limit - 1,
        resetAt: new Date(now + window * 1000)
      };
    }
    
    // Get current count
    const currentCount = parseInt(this.getIfNotExpired(key) || '0');
    
    if (currentCount >= limit) {
      return { 
        allowed: false, 
        remaining: 0,
        resetAt: new Date(parseInt(windowStart) + window * 1000)
      };
    }
    
    // Increment count
    this.setWithExpiry(key, (currentCount + 1).toString(), window);
    return { 
      allowed: true, 
      remaining: limit - currentCount - 1,
      resetAt: new Date(parseInt(windowStart) + window * 1000)
    };
  }
  
  // ============ UTILITY METHODS ============
  
  // Get storage stats (for monitoring)
  getStats() {
    const stats = {
      totalEntries: this.storage.size,
      byType: {
        blacklist: 0,
        userBlacklist: 0,
        refresh: 0,
        session: 0,
        reset: 0,
        verify: 0,
        rate: 0,
        other: 0
      }
    };
    
    for (const key of this.storage.keys()) {
      if (key.startsWith('blacklist:')) stats.byType.blacklist++;
      else if (key.startsWith('user_blacklist:')) stats.byType.userBlacklist++;
      else if (key.startsWith('refresh:')) stats.byType.refresh++;
      else if (key.startsWith('session:')) stats.byType.session++;
      else if (key.startsWith('reset:')) stats.byType.reset++;
      else if (key.startsWith('verify:')) stats.byType.verify++;
      else if (key.startsWith('rate:')) stats.byType.rate++;
      else stats.byType.other++;
    }
    
    return stats;
  }
  
  // Clear all data (use with caution)
  async clearAll() {
    this.storage.clear();
  }
  
  // Clear expired entries manually
  async forceCleanup() {
    this.cleanupExpired();
  }
}

module.exports = new TokenService();