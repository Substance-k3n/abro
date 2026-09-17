import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const PRESIGNED_GET_TTL_SECONDS = 5 * 60;

/**
 * Thin S3-compatible client wrapper -- docs/DECISIONS.md ADR-006. Targets
 * MinIO in dev (infra/docker/dev/compose.yml) via the AWS SDK v3 rather than
 * MinIO's own SDK, so swapping to real S3/R2/B2 in production later is an
 * endpoint/credentials change, not a code change. Knows nothing about
 * Expense or authorization -- ExpensesService owns those checks and calls
 * here only after they pass, same boundary as NotificationsService.
 */
@Injectable()
export class ReceiptStorageService {
  private readonly bucket = process.env.RECEIPTS_BUCKET ?? 'abro-receipts';
  private readonly client = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    // Required for MinIO (and most non-AWS S3-compatible endpoints):
    // bucket-in-path (http://host/bucket/key) instead of AWS's default
    // bucket-in-subdomain, which MinIO doesn't serve.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  });

  /** Same pattern as GoogleOAuthService.isConfigured() -- lets the controller respond 501 instead of crashing when unset. */
  isConfigured(): boolean {
    return Boolean(
      process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY,
    );
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Private storage (PRD §36) -- the client never talks to MinIO directly except through this short-lived, freshly-authorized URL. */
  async getPresignedGetUrl(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: PRESIGNED_GET_TTL_SECONDS,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export { PRESIGNED_GET_TTL_SECONDS };
