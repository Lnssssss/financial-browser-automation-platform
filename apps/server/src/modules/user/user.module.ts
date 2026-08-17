import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserRoleService } from './user-role.service';

@Module({
  providers: [UserService, UserRoleService],
  exports: [UserService, UserRoleService],
})
export class UserModule {}
