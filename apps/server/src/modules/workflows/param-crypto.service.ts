// 敏感参数加密。用 AES-256-GCM 对称加密：
// - 每次加密用随机 IV → 同一明文两次密文不同（防模式分析）
// - GCM 认证标签 → 密钥错误或密文被篡改时，解密直接抛错（不会静默返回垃圾）
//
// 密钥来自环境变量 FINRPA_PARAM_KEY，惰性加载。提供 setKey/resetKey 供测试注入。
// 对外三个能力：encrypt（入库前）、decrypt（执行时取回）、mask（API 响应展示）。

import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export const ENV_KEY_NAME = 'FINRPA_PARAM_KEY';

const IV_LENGTH = 12; // GCM 推荐 96-bit IV
const AUTH_TAG_LENGTH = 16;

/// 解密失败（密钥错误或密文损坏/被篡改）。
export class InvalidTokenError extends Error {
  constructor(message = 'Invalid token: decryption failed') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

@Injectable()
export class ParamCryptoService {
  // 32 字节 AES-256 密钥；null = 尚未加载
  private key: Buffer | null = null;

  /// 取密钥：已加载直接用；否则从环境变量派生。未配置则抛错。
  private getKey(): Buffer {
    if (this.key) return this.key;
    const raw = process.env[ENV_KEY_NAME];
    if (!raw) {
      throw new Error(
        `Environment variable ${ENV_KEY_NAME} is not set. ` +
          'Set it to any high-entropy secret string.',
      );
    }
    this.key = this.deriveKey(raw);
    return this.key;
  }

  /// 把任意字符串密钥派生成固定 32 字节（AES-256 需要定长密钥）。
  private deriveKey(raw: string): Buffer {
    return createHash('sha256').update(raw, 'utf8').digest();
  }

  /// 编程方式设置密钥（测试用）。
  setKey(raw: string): void {
    this.key = this.deriveKey(raw);
  }

  /// 清除密钥（测试清理用）。
  resetKey(): void {
    this.key = null;
  }

  /// 加密一个敏感参数值。返回 base64(iv + authTag + ciphertext)。
  encryptValue(plaintext: string): string {
    const key = this.getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  /// 解密一个敏感参数值。密钥错误或密文被篡改时抛 InvalidTokenError。
  decryptValue(ciphertext: string): string {
    const key = this.getKey();
    const data = Buffer.from(ciphertext, 'base64');
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(), // 认证失败在这里抛
      ]);
      return plaintext.toString('utf8');
    } catch {
      throw new InvalidTokenError();
    }
  }

  /// 掩码一个敏感值用于 API 展示。
  /// - 长度 <= 4：全掩为 ****
  /// - 长度 > 4：保留首尾字符，中间掩为 *
  maskValue(plaintext: string): string {
    if (plaintext.length <= 4) return '****';
    return plaintext[0] + '*'.repeat(plaintext.length - 2) + plaintext[plaintext.length - 1];
  }
}
