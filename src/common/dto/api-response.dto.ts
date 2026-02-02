
export class ApiResponse<T> {
    statusCode!: number;
    message!: string;
    data!: T;
}
