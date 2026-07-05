import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status: statusMock }) }),
  } as unknown as ArgumentsHost;
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps a grpc NOT_FOUND ServiceError to HTTP 404', () => {
    const grpcError = Object.assign(
      new Error(`${status.NOT_FOUND} NOT_FOUND: User not found`),
      { code: status.NOT_FOUND, details: 'User not found', metadata: {} },
    );

    filter.catch(grpcError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'User not found',
      }),
    );
  });

  it('maps a grpc UNAUTHENTICATED ServiceError to HTTP 401', () => {
    const grpcError = Object.assign(
      new Error(
        `${status.UNAUTHENTICATED} UNAUTHENTICATED: Invalid credentials`,
      ),
      {
        code: status.UNAUTHENTICATED,
        details: 'Invalid credentials',
        metadata: {},
      },
    );

    filter.catch(grpcError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
  });

  it('maps a grpc ALREADY_EXISTS ServiceError to HTTP 409', () => {
    const grpcError = Object.assign(
      new Error(
        `${status.ALREADY_EXISTS} ALREADY_EXISTS: Email already in use`,
      ),
      {
        code: status.ALREADY_EXISTS,
        details: 'Email already in use',
        metadata: {},
      },
    );

    filter.catch(grpcError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
  });

  it('falls back to 503 for an unmapped grpc code', () => {
    const grpcError = Object.assign(new Error('14 UNAVAILABLE: down'), {
      code: status.UNAVAILABLE,
      details: 'down',
      metadata: {},
    });

    filter.catch(grpcError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
