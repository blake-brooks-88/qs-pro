import { describe, expect, it } from 'vitest';

import { UsersController } from '../users.controller';

describe('UsersController', () => {
  describe('getMe()', () => {
    it('returns stub user structure when req.user is not set', () => {
      // Arrange
      const controller = new UsersController();
      const req = {};

      // Act
      const result = controller.getMe(req);

      // Assert
      expect(result).toEqual({
        id: 'stub-user-id',
        email: 'user@example.com',
        name: 'John Doe',
        tenant: {
          id: 'stub-tenant-id',
          eid: '12345',
        },
      });
    });

    it('returns req.user untouched when populated', () => {
      // Arrange
      const controller = new UsersController();
      const mockUser = {
        id: 'real-user-123',
        email: 'real@example.com',
        name: 'Real User',
        tenant: {
          id: 'real-tenant-456',
          eid: '67890',
        },
      };
      const req = { user: mockUser };

      // Act
      const result = controller.getMe(req);

      // Assert
      expect(result).toBe(mockUser);
    });
  });
});
