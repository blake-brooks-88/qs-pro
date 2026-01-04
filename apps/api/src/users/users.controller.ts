import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get('me')
  async getMe(@Req() req: any) {
    // In a real app, this would be protected by a guard and extract user from session/JWT
    // For now, returning a stub or simplified response as per Task 2.5
    if (!req.user) {
      return { 
        id: 'stub-user-id', 
        email: 'user@example.com', 
        name: 'John Doe',
        tenant: {
          id: 'stub-tenant-id',
          eid: '12345'
        }
      };
    }
    return req.user;
  }
}
