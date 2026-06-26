import { NestFactory, Reflector } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);

  const reflector = app.get(Reflector);

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());
  app.useGlobalGuards(new JwtAuthGuard(reflector, app.get('AUTH_SERVICE')));

  app.setGlobalPrefix('api/v1');
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('FSA Events API')
    .setDescription('API Gateway for the FSA Events microservices platform')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearerAuth')
    .addServer(`http://localhost:${process.env.PORT ?? 3000}/api/v1`, 'Local')
    .build();

  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, swaggerConfig));

  // Static import compiles to CJS require() with module:nodenext.
  // @scalar/client-side-rendering is ESM-only, so the CJS build fails with ERR_REQUIRE_ESM.
  // Dynamic import() stays native in nodenext CJS → loads the ESM build → works.
  const { apiReference } = await import('@scalar/nestjs-api-reference');

  app.use(
    '/docs',
    apiReference({
      spec: { content: document },
      theme: 'default',
      authentication: { preferredSecurityScheme: 'bearerAuth' },
      defaultHttpClient: { targetKey: 'javascript', clientKey: 'fetch' },
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
