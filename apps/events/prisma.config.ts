import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

config({ path: '../../.env' }); // ponytail: root .env; cwd is app dir during migrate

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: env('EVENTS_DATABASE_URL'),
  },
});
