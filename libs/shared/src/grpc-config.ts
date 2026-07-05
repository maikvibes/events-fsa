import { join } from 'path';
import { ClientProviderOptions, Transport } from '@nestjs/microservices';

// Resolves the same way in dev (cwd = repo root under `nest start`) and in the
// Docker runner stage, which explicitly copies this directory alongside dist
// (see Dockerfile) since @grpc/proto-loader needs a real file on disk.
export const protoPath = (fileName: string): string =>
  join(process.cwd(), 'libs/shared/src/proto', fileName);

// Shared @grpc/proto-loader options applied identically on both the client
// (gateway) and server (auth/events) so the wire encoding matches on both ends.
// `defaults: true` guarantees `repeated` fields always arrive as arrays (never
// undefined for an empty list) and scalar counts like `total: 0` survive the
// proto3 "0 is the default, not serialized" rule — while proto3 `optional`
// fields keep explicit presence, so an unset one still reads as undefined.
export const grpcLoaderOptions = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
} as const;

export const grpcClientConfig = (
  name: string,
  packageName: string,
  protoFile: string,
  url: string,
): ClientProviderOptions => ({
  name,
  transport: Transport.GRPC,
  options: {
    package: packageName,
    protoPath: protoPath(protoFile),
    url,
    loader: grpcLoaderOptions,
  },
});

// Shared "no content" message type for gRPC methods that take or return
// nothing meaningful (mirrors `message Empty {}` in both .proto files).
export interface Empty {
  [key: string]: never;
}
