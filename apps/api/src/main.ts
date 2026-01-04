import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import secureSession from '@fastify/secure-session';
import formBody from '@fastify/formbody';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(formBody);

  await app.register(secureSession, {
    secret: process.env.SESSION_SECRET || 'a-very-secret-key-that-is-at-least-32-chars-long',
    salt: process.env.SESSION_SALT || '1234567890123456',
    cookie: {
      path: '/',
      httpOnly: true,
      secure: true, // Required for sameSite: 'none'
      sameSite: 'none', // Required for SFMC iframe
    }
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
