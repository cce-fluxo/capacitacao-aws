import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { DbService } from './db.service';
import { S3Service } from './s3.service';
import { ServerService } from './server.service';

@Controller()
export class AppController {
  constructor(
    private server: ServerService,
    private db: DbService,
    private s3: S3Service,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('status')
  async status() {
    const [db, s3] = await Promise.all([this.db.status(), this.s3.status()]);
    return { server: this.server.info(), db, s3 };
  }

  @Get('notes')
  notes() {
    return this.db.list();
  }

  @Post('notes')
  addNote(@Body() body: { text?: unknown }) {
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (text.length < 1 || text.length > 280) throw new BadRequestException('A nota deve ter de 1 a 280 caracteres');
    return this.db.add(text);
  }

  @Post('uploads/presign')
  presign(@Body() body: { filename?: unknown; contentType?: unknown }) {
    const { filename, contentType } = body ?? {};
    if (typeof filename !== 'string' || !filename) throw new BadRequestException('filename é obrigatório');
    if (typeof contentType !== 'string' || !contentType.startsWith('image/')) {
      throw new BadRequestException('Só são aceitas imagens (image/*)');
    }
    return this.s3.presign(filename, contentType);
  }

  @Get('uploads')
  uploads() {
    return this.s3.list();
  }
}
