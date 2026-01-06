import { Injectable } from '@nestjs/common';
import { EnvVarSchema } from '@qs-pro/shared-types';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
