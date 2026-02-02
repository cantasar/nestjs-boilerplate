export interface OtpTemplateParams {
  otp: string;
}

export const getOtpEmailTemplate = ({ otp }: OtpTemplateParams): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #333333; text-align: center; margin-bottom: 20px;">OTP Verification</h2>
        <p style="color: #666666; font-size: 16px; text-align: center;">Your one-time password (OTP) is:</p>
        <div style="background-color: #f0f0f0; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <h1 style="color: #4CAF50; letter-spacing: 8px; font-size: 36px; margin: 0;">${otp}</h1>
        </div>
        <p style="color: #999999; font-size: 14px; text-align: center;">This code will expire in 10 minutes.</p>
        <hr style="border: none; border-top: 1px solid #eeeeee; margin: 20px 0;">
        <p style="color: #999999; font-size: 12px; text-align: center;">
          If you didn't request this code, please ignore this email.
        </p>
      </div>
    </div>
  `;
};
