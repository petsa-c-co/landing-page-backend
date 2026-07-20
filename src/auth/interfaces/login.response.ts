import { PublicUser } from './public-user.interface';

export interface LoginResponse {
    user: PublicUser;
    tokens: {
        accessToken: string;
        refreshToken: string;
    };
}
