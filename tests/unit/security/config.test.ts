describe('Configuración de seguridad', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousJwt = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwt;
    jest.resetModules();
    jest.dontMock('dotenv');
  });

  function mockDotenv() {
    jest.resetModules();
    jest.doMock('dotenv', () => ({
      __esModule: true,
      default: { config: jest.fn(() => ({ parsed: undefined })) },
    }));
  }

  it('fuera de test, sin JWT_SECRET, la configuración no arranca', () => {
    mockDotenv();
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    jest.isolateModules(() => {
      expect(() => {
        require('../../../src/infrastructure/config/env');
      }).toThrow(/JWT_SECRET/);
    });
  });

  it('en test, sin JWT_SECRET, usa un secreto que no es el valor histórico por defecto', () => {
    mockDotenv();
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
    jest.isolateModules(() => {
      const loaded = require('../../../src/infrastructure/config/env');
      expect(loaded.env.jwtSecret).toBe('test-only-jwt-secret');
      expect(loaded.env.jwtSecret).not.toBe('pawmily-dev-secret');
    });
  });
});
