import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts authenticated user (or a field) from the request.
 * @param data - Optional property name on `user` (e.g. `'id'`)
 */
export const GetUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: Record<string, unknown> }>();
    const user = request.user;
    if (!data) {
      return user;
    }
    return user?.[data];
  },
);
