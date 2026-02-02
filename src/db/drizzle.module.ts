import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDrizzleClient } from './index';

export const DRIZZLE = Symbol('DRIZZLE');

@Global()
@Module({
    providers: [
        {
            provide: DRIZZLE,
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
                const connectionString = configService.getOrThrow<string>('DATABASE_URL');
                return createDrizzleClient(connectionString);
            },
        },
    ],
    exports: [DRIZZLE],
})
export class DrizzleModule { }
