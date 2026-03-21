import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

/** Auth response with tokens and user. */
export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
