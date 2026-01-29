import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApp, type ConfigureAppOptions } from '../configure-app';

vi.mock('@fastify/secure-session', () => ({
  default: vi.fn(),
}));

vi.mock('@qpp/backend-shared', () => ({
  getDbFromContext: vi.fn(),
  runWithDbContext: vi.fn(),
}));

vi.mock('@qpp/database', () => ({
  createDatabaseFromClient: vi.fn(() => ({})),
}));

import { getDbFromContext, runWithDbContext } from '@qpp/backend-shared';
import { createDatabaseFromClient } from '@qpp/database';

type OnRequestHook = (
  req: { method: string; session?: { get: (key: string) => unknown } },
  reply: { raw: { once: (event: string, handler: () => void) => void } },
  done: (err?: Error) => void,
) => void;

function createMockReserved() {
  const releaseFn = vi.fn();
  const queries: string[] = [];

  const reserved = Object.assign(
    function taggedTemplate(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) {
      let query = '';
      for (let i = 0; i < strings.length; i++) {
        query += strings[i];
        if (i < values.length) {
          query += String(values[i]);
        }
      }
      queries.push(query);
      return Promise.resolve([{ result: 1 }]);
    },
    { release: releaseFn, _queries: queries },
  );

  return reserved;
}

function createMockApp() {
  const hooks: { onRequest: OnRequestHook[] } = { onRequest: [] };
  const fastifyInstance = {
    addHook: vi.fn((hookName: string, handler: OnRequestHook) => {
      if (hookName === 'onRequest') {
        hooks.onRequest.push(handler);
      }
    }),
  };

  type MockApp = Omit<
    NestFastifyApplication,
    | 'get'
    | 'register'
    | 'setGlobalPrefix'
    | 'useGlobalFilters'
    | 'getHttpAdapter'
  > & {
    setGlobalPrefix: ReturnType<typeof vi.fn>;
    useGlobalFilters: ReturnType<typeof vi.fn>;
    register: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    getHttpAdapter: ReturnType<typeof vi.fn>;
    _hooks: typeof hooks;
    _fastifyInstance: typeof fastifyInstance;
  };

  const mockApp = {
    setGlobalPrefix: vi.fn(),
    useGlobalFilters: vi.fn(),
    register: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    getHttpAdapter: vi.fn(() => ({
      getInstance: vi.fn(() => fastifyInstance),
    })),
    _hooks: hooks,
    _fastifyInstance: fastifyInstance,
  };

  return mockApp as unknown as MockApp;
}

describe('configureApp', () => {
  let mockApp: ReturnType<typeof createMockApp>;

  beforeEach(() => {
    mockApp = createMockApp();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('global prefix setup', () => {
    it('sets api prefix by default', async () => {
      // Arrange - default options

      // Act
      await configureApp(mockApp);

      // Assert
      expect(mockApp.setGlobalPrefix).toHaveBeenCalledWith('api');
      expect(mockApp.setGlobalPrefix).toHaveBeenCalledTimes(1);
    });

    it('does not set prefix when globalPrefix option is false', async () => {
      // Arrange
      const options: ConfigureAppOptions = { globalPrefix: false };

      // Act
      await configureApp(mockApp, options);

      // Assert
      expect(mockApp.setGlobalPrefix).not.toHaveBeenCalled();
    });
  });

  describe('session registration', () => {
    it('registers secure-session when session options are provided', async () => {
      // Arrange
      const options: ConfigureAppOptions = {
        session: {
          secret: 'test-secret-32-chars-long-here!',
          salt: 'test-salt-16char',
          cookie: {
            secure: true,
            sameSite: 'strict',
          },
        },
      };

      // Act
      await configureApp(mockApp, options);

      // Assert
      expect(mockApp.register).toHaveBeenCalledTimes(1);
      expect(mockApp.register).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          secret: 'test-secret-32-chars-long-here!',
          salt: 'test-salt-16char',
          cookie: expect.objectContaining({
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
          }),
        }),
      );
    });

    it('does not register secure-session when session options are not provided', async () => {
      // Arrange - no session options

      // Act
      await configureApp(mockApp);

      // Assert
      expect(mockApp.register).not.toHaveBeenCalled();
    });
  });

  describe('RLS context hook (onRequest)', () => {
    let mockReserved: ReturnType<typeof createMockReserved>;
    let mockSqlClient: {
      reserve: ReturnType<typeof vi.fn>;
      options: object;
      parameters: object;
    };

    beforeEach(() => {
      mockReserved = createMockReserved();
      mockSqlClient = {
        reserve: vi.fn().mockResolvedValue(mockReserved),
        options: {},
        parameters: {},
      };
      mockApp.get.mockImplementation((token: string) => {
        if (token === 'SQL_CLIENT') {
          return mockSqlClient;
        }
        return undefined;
      });
    });

    it('skips hook processing when db context already exists', async () => {
      // Arrange
      vi.mocked(getDbFromContext).mockReturnValue({} as never);
      const options: ConfigureAppOptions = { rls: true };

      await configureApp(mockApp, options);

      const hook = mockApp._hooks.onRequest.at(0);
      if (!hook) {
        throw new Error('Expected onRequest hook to be registered');
      }
      const done = vi.fn();

      // Act
      hook({ method: 'GET' }, { raw: { once: vi.fn() } }, done);

      // Assert
      expect(done).toHaveBeenCalledWith();
      expect(mockSqlClient.reserve).not.toHaveBeenCalled();
    });

    it('skips hook processing for OPTIONS requests', async () => {
      // Arrange
      vi.mocked(getDbFromContext).mockReturnValue(undefined);
      const options: ConfigureAppOptions = { rls: true };

      await configureApp(mockApp, options);

      const hook = mockApp._hooks.onRequest.at(0);
      if (!hook) {
        throw new Error('Expected onRequest hook to be registered');
      }
      const done = vi.fn();

      // Act
      hook({ method: 'OPTIONS' }, { raw: { once: vi.fn() } }, done);

      // Assert
      expect(done).toHaveBeenCalledWith();
      expect(mockSqlClient.reserve).not.toHaveBeenCalled();
    });

    it('skips hook processing when session tenantId is missing', async () => {
      // Arrange
      vi.mocked(getDbFromContext).mockReturnValue(undefined);
      const options: ConfigureAppOptions = { rls: true };

      await configureApp(mockApp, options);

      const hook = mockApp._hooks.onRequest.at(0);
      if (!hook) {
        throw new Error('Expected onRequest hook to be registered');
      }
      const done = vi.fn();
      const mockSession = {
        get: vi.fn((key: string) => (key === 'mid' ? 'mid-123' : undefined)),
      };

      // Act
      hook(
        { method: 'POST', session: mockSession },
        { raw: { once: vi.fn() } },
        done,
      );

      // Assert
      expect(done).toHaveBeenCalledWith();
      expect(mockSqlClient.reserve).not.toHaveBeenCalled();
    });

    it('skips hook processing when session mid is missing', async () => {
      // Arrange
      vi.mocked(getDbFromContext).mockReturnValue(undefined);
      const options: ConfigureAppOptions = { rls: true };

      await configureApp(mockApp, options);

      const hook = mockApp._hooks.onRequest.at(0);
      if (!hook) {
        throw new Error('Expected onRequest hook to be registered');
      }
      const done = vi.fn();
      const mockSession = {
        get: vi.fn((key: string) =>
          key === 'tenantId' ? 'tenant-123' : undefined,
        ),
      };

      // Act
      hook(
        { method: 'POST', session: mockSession },
        { raw: { once: vi.fn() } },
        done,
      );

      // Assert
      expect(done).toHaveBeenCalledWith();
      expect(mockSqlClient.reserve).not.toHaveBeenCalled();
    });

    it('sets RLS config and runs handler in db context when session data present', async () => {
      // Arrange
      vi.mocked(getDbFromContext).mockReturnValue(undefined);
      vi.mocked(runWithDbContext).mockImplementation((_db, fn) => fn());
      vi.mocked(createDatabaseFromClient).mockReturnValue({} as never);

      const options: ConfigureAppOptions = { rls: true };

      await configureApp(mockApp, options);

      const hook = mockApp._hooks.onRequest.at(0);
      if (!hook) {
        throw new Error('Expected onRequest hook to be registered');
      }
      const done = vi.fn();
      const mockSession = {
        get: vi.fn((key: string) => {
          if (key === 'tenantId') {
            return 'tenant-123';
          }
          if (key === 'mid') {
            return 'mid-456';
          }
          return undefined;
        }),
      };

      // Act
      hook(
        { method: 'POST', session: mockSession },
        { raw: { once: vi.fn() } },
        done,
      );

      // Assert - wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockSqlClient.reserve).toHaveBeenCalled();
      expect(mockReserved._queries).toEqual(
        expect.arrayContaining([
          expect.stringContaining('set_config'),
          expect.stringContaining('tenant-123'),
        ]),
      );
      expect(createDatabaseFromClient).toHaveBeenCalled();
      expect(runWithDbContext).toHaveBeenCalledWith(expect.anything(), done);
    });
  });

  describe('cleanup on finish/close/error', () => {
    let mockReserved: ReturnType<typeof createMockReserved>;
    let mockSqlClient: {
      reserve: ReturnType<typeof vi.fn>;
      options: object;
      parameters: object;
    };

    beforeEach(() => {
      mockReserved = createMockReserved();
      mockSqlClient = {
        reserve: vi.fn().mockResolvedValue(mockReserved),
        options: {},
        parameters: {},
      };
      mockApp.get.mockImplementation((token: string) => {
        if (token === 'SQL_CLIENT') {
          return mockSqlClient;
        }
        return undefined;
      });
      vi.mocked(getDbFromContext).mockReturnValue(undefined);
      vi.mocked(runWithDbContext).mockImplementation((_db, fn) => fn());
      vi.mocked(createDatabaseFromClient).mockReturnValue({} as never);
    });

    it('registers cleanup handler for finish event', async () => {
      // Arrange
      const options: ConfigureAppOptions = { rls: true };
      await configureApp(mockApp, options);

      const hook = mockApp._hooks.onRequest.at(0);
      if (!hook) {
        throw new Error('Expected onRequest hook to be registered');
      }
      const done = vi.fn();
      const onceHandlers: Record<string, () => void> = {};
      const mockReplyRaw = {
        once: vi.fn((event: string, handler: () => void) => {
          onceHandlers[event] = handler;
        }),
      };
      const mockSession = {
        get: vi.fn((key: string) => {
          if (key === 'tenantId') {
            return 'tenant-123';
          }
          if (key === 'mid') {
            return 'mid-456';
          }
          return undefined;
        }),
      };

      // Act
      hook(
        { method: 'POST', session: mockSession },
        { raw: mockReplyRaw },
        done,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Assert
      expect(mockReplyRaw.once).toHaveBeenCalledWith(
        'finish',
        expect.any(Function),
      );

      // Trigger cleanup
      const finishHandler = onceHandlers['finish'];
      if (!finishHandler) {
        throw new Error('Expected finish cleanup handler to be registered');
      }
      finishHandler();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockReserved.release).toHaveBeenCalled();
    });

    it('registers cleanup handler for close event', async () => {
      // Arrange
      const options: ConfigureAppOptions = { rls: true };
      await configureApp(mockApp, options);

      const hook = mockApp._hooks.onRequest.at(0);
      if (!hook) {
        throw new Error('Expected onRequest hook to be registered');
      }
      const done = vi.fn();
      const onceHandlers: Record<string, () => void> = {};
      const mockReplyRaw = {
        once: vi.fn((event: string, handler: () => void) => {
          onceHandlers[event] = handler;
        }),
      };
      const mockSession = {
        get: vi.fn((key: string) => {
          if (key === 'tenantId') {
            return 'tenant-123';
          }
          if (key === 'mid') {
            return 'mid-456';
          }
          return undefined;
        }),
      };

      // Act
      hook(
        { method: 'POST', session: mockSession },
        { raw: mockReplyRaw },
        done,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Assert
      expect(mockReplyRaw.once).toHaveBeenCalledWith(
        'close',
        expect.any(Function),
      );

      // Trigger cleanup
      const closeHandler = onceHandlers['close'];
      if (!closeHandler) {
        throw new Error('Expected close cleanup handler to be registered');
      }
      closeHandler();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockReserved.release).toHaveBeenCalled();
    });

    it('registers cleanup handler for error event', async () => {
      // Arrange
      const options: ConfigureAppOptions = { rls: true };
      await configureApp(mockApp, options);

      const hook = mockApp._hooks.onRequest.at(0);
      if (!hook) {
        throw new Error('Expected onRequest hook to be registered');
      }
      const done = vi.fn();
      const onceHandlers: Record<string, () => void> = {};
      const mockReplyRaw = {
        once: vi.fn((event: string, handler: () => void) => {
          onceHandlers[event] = handler;
        }),
      };
      const mockSession = {
        get: vi.fn((key: string) => {
          if (key === 'tenantId') {
            return 'tenant-123';
          }
          if (key === 'mid') {
            return 'mid-456';
          }
          return undefined;
        }),
      };

      // Act
      hook(
        { method: 'POST', session: mockSession },
        { raw: mockReplyRaw },
        done,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Assert
      expect(mockReplyRaw.once).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );

      // Trigger cleanup
      const errorHandler = onceHandlers['error'];
      if (!errorHandler) {
        throw new Error('Expected error cleanup handler to be registered');
      }
      errorHandler();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockReserved.release).toHaveBeenCalled();
    });
  });
});
