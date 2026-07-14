import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SeedProgressService } from '@app/shared';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from './prisma.service';
import { SeedService } from './seed.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AuthController],
  providers: [AuthService, PrismaService, SeedService, SeedProgressService],
})
export class AuthModule {}
