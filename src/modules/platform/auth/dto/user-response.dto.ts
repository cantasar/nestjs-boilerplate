import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../shared/database/schema/enums/user-role.enum';

export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ nullable: true, example: 'user@example.com' })
  email: string | null;

  @ApiProperty({ nullable: true, example: 'Jane' })
  firstName: string | null;

  @ApiProperty({ nullable: true, example: 'Doe' })
  lastName: string | null;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: UserRole.USER })
  role: UserRole;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  updatedAt: Date;
}
