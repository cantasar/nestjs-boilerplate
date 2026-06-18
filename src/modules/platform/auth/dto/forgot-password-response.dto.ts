import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordResponseDto {
  @ApiProperty({
    example: 'If the email exists, a verification code has been sent.',
  })
  message: string;
}
