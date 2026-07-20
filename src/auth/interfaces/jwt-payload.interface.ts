export interface JwtPayload {
    sub: string;
    // Emitido automáticamente por jsonwebtoken (segundos Unix). Se usa para
    // invalidar tokens anteriores al último cambio de contraseña.
    iat?: number;
}
