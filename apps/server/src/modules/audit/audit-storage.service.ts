import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

// 审计截图的对象存储。负责：
// - 用结构化 object key 上传前/后截图
// - 生成临时访问用的 presigned URL
// - 按月自动建桶（finrpa-audit-{YYYYMM}）
//
// object key 生成 / bucket 命名是纯逻辑（可独立测）；真正落对象存储的
// upload/presigned/ensureBucket 走注入的 client。client 现留空（占位），
// 真实 MinIO 或 S3 兼容后端 Stage 4 接——同 action-cache 换 Redis、approval 接
// BullMQ 的"接口先立、后端后接"套路。

/// presigned URL 默认有效期（秒）：1 小时。
export const DEFAULT_PRESIGN_EXPIRY_SECONDS = 3600;

/// 对象存储客户端的最小契约（真实实现 MinIO/S3 满足即可）。
/// 只列审计用到的四个方法，测试可注入假体。
export interface ObjectStorageClient {
  bucketExists(bucket: string): Promise<boolean>;
  makeBucket(bucket: string): Promise<void>;
  putObject(bucket: string, key: string, data: Buffer, contentType: string): Promise<void>;
  presignedGetObject(bucket: string, key: string, expirySeconds: number): Promise<string>;
}

/// 生成结构化的截图 object key。
/// 格式：audit/{orgId}/{taskId}/{index}_{phase}_{uuid}.png
export function generateObjectKey(
  orgId: string,
  taskId: string,
  actionIndex: number,
  phase: 'before' | 'after',
): string {
  const uid = randomBytes(6).toString('hex'); // 12 位 hex
  return `audit/${orgId}/${taskId}/${actionIndex}_${phase}_${uid}.png`;
}

/// 按月的审计 bucket 名。格式：finrpa-audit-{YYYYMM}。
/// 传 date 用它、否则用当前 UTC 月份。
export function getBucketName(date?: Date): string {
  const dt = date ?? new Date();
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `finrpa-audit-${yyyy}${mm}`;
}

@Injectable()
export class AuditStorageService {
  /// client 可为 null：Stage 3 无真实对象存储，接线留 Stage 4。
  constructor(private readonly client: ObjectStorageClient | null = null) {}

  private requireClient(): ObjectStorageClient {
    if (this.client === null) {
      throw new Error('ObjectStorageClient 未接线（Stage 4 接入 MinIO/S3）');
    }
    return this.client;
  }

  generateObjectKey = generateObjectKey;
  getBucketName = getBucketName;

  /// 桶不存在则建，返回 true=新建 / false=已存在。
  async ensureBucketExists(bucket: string): Promise<boolean> {
    const client = this.requireClient();
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket);
      return true;
    }
    return false;
  }

  /// 上传截图，返回 object key。
  async uploadScreenshot(
    bucket: string,
    key: string,
    data: Buffer,
    contentType = 'image/png',
  ): Promise<string> {
    await this.requireClient().putObject(bucket, key, data, contentType);
    return key;
  }

  /// 生成临时访问 URL。
  async getPresignedUrl(
    bucket: string,
    key: string,
    expirySeconds: number = DEFAULT_PRESIGN_EXPIRY_SECONDS,
  ): Promise<string> {
    return this.requireClient().presignedGetObject(bucket, key, expirySeconds);
  }
}
