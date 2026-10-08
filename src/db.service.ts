import { Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';

const msg = (e: unknown) => (e instanceof Error ? e.message || e.name : String(e));

@Injectable()
export class DbService implements OnModuleInit {
  private pool?: Pool;

  get configured() {
    return !!this.pool;
  }

  // sem await no boot: banco lento ou fora do ar nunca atrasa nem derruba a app
  onModuleInit() {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    this.pool = new Pool({
      connectionString: url,
      // RDS exige SSL; DB_SSL=false só para teste local
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    this.pool.on('error', (e) => console.error('Erro no pool do banco:', msg(e)));
    this.pool
      .query(
        `CREATE TABLE IF NOT EXISTS notes (
           id serial primary key,
           text varchar(280) not null,
           created_at timestamptz not null default now())`,
      )
      .then(() => console.log('Banco conectado'))
      .catch((e) => console.error(`Falha ao conectar no banco: ${msg(e)}`));
  }

  private need(): Pool {
    if (!this.pool) throw new ServiceUnavailableException('Banco não configurado: defina DATABASE_URL no .env');
    return this.pool;
  }

  async status() {
    if (!this.pool) return { configured: false, ok: false };
    try {
      const r = await this.pool.query('select count(*) from notes');
      return { configured: true, ok: true, notesCount: Number(r.rows[0].count) };
    } catch (e) {
      return { configured: true, ok: false, error: msg(e) };
    }
  }

  async list() {
    try {
      const r = await this.need().query('select id, text, created_at from notes order by id desc limit 20');
      return r.rows;
    } catch (e) {
      throw this.wrap(e);
    }
  }

  async add(text: string) {
    try {
      const r = await this.need().query('insert into notes (text) values ($1) returning id, text, created_at', [text]);
      return r.rows[0];
    } catch (e) {
      throw this.wrap(e);
    }
  }

  private wrap(e: unknown) {
    return e instanceof ServiceUnavailableException ? e : new ServiceUnavailableException(`Banco indisponível: ${msg(e)}`);
  }
}
