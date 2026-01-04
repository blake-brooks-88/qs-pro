import { Injectable } from '@nestjs/common';
import { EnvVarSchema } from '@qs-pro/shared-types';

@Injectable()
export class AppService {
  getHello(): string {
    // Basic verification of shared types import
    console.log('Shared types verified:', !!EnvVarSchema);
    return 'Hello World!';
  }
}
