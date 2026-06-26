import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: env('NOTIFICATIONS_DATABASE_URL'),
  },
});
