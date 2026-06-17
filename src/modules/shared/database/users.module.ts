import { Module } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';

@Module({
  providers: [UserRepository],
  exports: [UserRepository],
})
export class UsersModule {}
