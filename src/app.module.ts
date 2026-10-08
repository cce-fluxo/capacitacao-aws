import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { DbService } from './db.service';
import { S3Service } from './s3.service';
import { ServerService } from './server.service';

@Module({
  imports: [
    // lê o .env do diretório atual (a app roda sempre com cwd /opt/app)
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/{*path}'],
    }),
  ],
  controllers: [AppController],
  providers: [ServerService, DbService, S3Service],
})
export class AppModule {}
