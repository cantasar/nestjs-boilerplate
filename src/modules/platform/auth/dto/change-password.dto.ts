import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'currentpassword123' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'newpassword123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  newPassword: string;
}
