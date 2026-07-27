/**
 * [INPUT]: 依赖 node:crypto 的 RSA、AES-256-GCM、哈希与随机数能力，以及统一 Logger
 * [OUTPUT]: 对外提供 CryptoHelper，完成 CAS 密码加密、票据 token 提取与静默认证密码加解密
 * [POS]: utils 的密码学适配器，被旧认证实现与 Identity 登录 composition 复用，不承载登录业务规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { publicEncrypt, constants, createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Logger } from './logger';

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export class CryptoHelper {
  static encryptPassword(password: string, publicKey: string): string | null {
    try {
      const buffer = Buffer.from(password);
      const encrypted = publicEncrypt({
        key: publicKey,
        padding: constants.RSA_PKCS1_PADDING
      }, buffer);
      return `__RSA__${encrypted.toString('base64')}`;
    } catch (e: any) {
      Logger.error('Crypto', 'RSA加密失败', e);
      return null;
    }
  }

  static extractTokenFromUrl(urlStr: string): string | null {
    try {
      const url = new URL(urlStr);
      const ticket = url.searchParams.get('ticket');
      if (!ticket) return null;

      const parts = ticket.split('.');
      if (parts.length !== 3) return null;

      let base64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
      const padding = base64.length % 4;
      if (padding > 0) base64 += '='.repeat(4 - padding);

      const payloadBuf = Buffer.from(base64, 'base64');
      const payload = JSON.parse(payloadBuf.toString('utf-8'));

      return payload.idToken || null;
    } catch (e: any) {
      Logger.error('Crypto', 'Token提取失败', e);
      return null;
    }
  }

  /**
   * AES-256-GCM encrypt — for storing user password server-side
   * Format: base64(iv[12] + authTag[16] + ciphertext)
   */
  static encryptAES(plaintext: string, secret: string): string {
    const key = deriveKey(secret);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  /**
   * AES-256-GCM decrypt
   */
  static decryptAES(encoded: string, secret: string): string | null {
    try {
      const key = deriveKey(secret);
      const buf = Buffer.from(encoded, 'base64');
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const data = buf.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
    } catch (e: any) {
      Logger.error('Crypto', 'AES解密失败', e);
      return null;
    }
  }
}
