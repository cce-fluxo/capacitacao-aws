import { Injectable, OnModuleInit } from '@nestjs/common';
import { hostname } from 'os';

const IMDS = 'http://169.254.169.254/latest';
const get = (path: string, token: string) =>
  fetch(`${IMDS}/${path}`, {
    headers: { 'X-aws-ec2-metadata-token': token },
    signal: AbortSignal.timeout(1000),
  }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));

@Injectable()
export class ServerService implements OnModuleInit {
  private meta = { instanceId: 'local', availabilityZone: 'local', region: 'local', instanceType: 'local' };

  // IMDSv2, buscado uma vez no boot. Fora da AWS dá timeout e fica "local".
  async onModuleInit() {
    try {
      const token = await fetch(`${IMDS}/api/token`, {
        method: 'PUT',
        headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '60' },
        signal: AbortSignal.timeout(1000),
      }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));
      const [instanceId, availabilityZone, region, instanceType] = await Promise.all([
        get('meta-data/instance-id', token),
        get('meta-data/placement/availability-zone', token),
        get('meta-data/placement/region', token),
        get('meta-data/instance-type', token),
      ]);
      this.meta = { instanceId, availabilityZone, region, instanceType };
    } catch {
      // fora da AWS: mantém "local"
    }
  }

  info() {
    return { ...this.meta, hostname: hostname(), uptimeSeconds: Math.round(process.uptime()) };
  }
}
