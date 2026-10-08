import { Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { GetObjectCommand, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { msg } from './util';


@Injectable()
export class S3Service implements OnModuleInit {
  private bucket = process.env.S3_BUCKET;
  // credenciais sempre pela cadeia padrão (instance profile), nunca access keys
  private client = new S3Client({ region: process.env.AWS_REGION });

  onModuleInit() {
    console.log(this.bucket ? `S3 configurado: ${this.bucket}` : 'S3 não configurado');
  }

  private need(): string {
    if (!this.bucket) throw new ServiceUnavailableException('S3 não configurado: defina S3_BUCKET no .env');
    return this.bucket;
  }

  async status() {
    if (!this.bucket) return { configured: false, ok: false };
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { configured: true, ok: true, bucket: this.bucket };
    } catch (e) {
      return { configured: true, ok: false, bucket: this.bucket, error: msg(e) };
    }
  }

  async presign(filename: string, contentType: string) {
    const Bucket = this.need();
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    const key = `uploads/${Date.now()}-${safe}`;
    try {
      const uploadUrl = await getSignedUrl(
        this.client,
        new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }),
        { expiresIn: 300 },
      );
      return { uploadUrl, key };
    } catch (e) {
      throw new ServiceUnavailableException(`S3 indisponível: ${msg(e)}`);
    }
  }

  async list() {
    const Bucket = this.need();
    try {
      const r = await this.client.send(new ListObjectsV2Command({ Bucket, Prefix: 'uploads/' }));
      const recent = (r.Contents ?? [])
        .filter((o) => o.Key && o.Key !== 'uploads/')
        .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
        .slice(0, 12); // ponytail: só a 1ª página (1000 objetos); suficiente para a demo
      return Promise.all(
        recent.map(async (o) => ({
          key: o.Key!,
          size: o.Size,
          lastModified: o.LastModified,
          url: await getSignedUrl(this.client, new GetObjectCommand({ Bucket, Key: o.Key! }), { expiresIn: 600 }),
        })),
      );
    } catch (e) {
      throw new ServiceUnavailableException(`S3 indisponível: ${msg(e)}`);
    }
  }
}
