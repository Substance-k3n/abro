import { ReceiptStorageService } from './receipt-storage.service';

/**
 * Hits real MinIO (infra/docker/dev/compose.yml's `minio` service, bucket
 * provisioned by `minio-createbuckets`) -- same "hit the real thing, don't
 * mock" convention as every Postgres-backed spec in this repo.
 */
describe('ReceiptStorageService (integration)', () => {
  const storage = new ReceiptStorageService();
  const uploadedKeys: string[] = [];

  afterEach(async () => {
    await Promise.all(uploadedKeys.map((key) => storage.delete(key)));
    uploadedKeys.length = 0;
  });

  it('is configured against the dev MinIO env vars', () => {
    expect(storage.isConfigured()).toBe(true);
  });

  it('uploads an object and reads it back through a presigned GET URL', async () => {
    const key = `test/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    uploadedKeys.push(key);
    const body = Buffer.from('fake-png-bytes');

    await storage.upload(key, body, 'image/png');
    const url = await storage.getPresignedGetUrl(key);

    expect(url).toContain(key);
    const response = await fetch(url);
    expect(response.ok).toBe(true);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
    expect(response.headers.get('content-type')).toBe('image/png');
  });

  it('produces a URL that expires (short TTL), not a permanently public one', async () => {
    const key = `test/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    uploadedKeys.push(key);
    await storage.upload(key, Buffer.from('x'), 'image/png');

    const url = await storage.getPresignedGetUrl(key);
    expect(url).toMatch(/X-Amz-Expires=\d+/);
  });

  it('deletes an object so it is no longer fetchable', async () => {
    const key = `test/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    await storage.upload(key, Buffer.from('x'), 'image/png');

    await storage.delete(key);

    const url = await storage.getPresignedGetUrl(key);
    const response = await fetch(url);
    expect(response.ok).toBe(false);
  });
});
