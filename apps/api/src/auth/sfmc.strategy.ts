import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-oauth2';

@Injectable()
export class SfmcStrategy extends PassportStrategy(Strategy, 'sfmc') {
  constructor() {
    super({
      authorizationURL: 'https://stub-auth.example.com/authorize',
      tokenURL: 'https://stub-auth.example.com/token',
      clientID: 'stub-client-id',
      clientSecret: 'stub-client-secret',
      callbackURL: 'http://localhost:3000/auth/callback',
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any) {
    return { accessToken, refreshToken, profile };
  }
}
