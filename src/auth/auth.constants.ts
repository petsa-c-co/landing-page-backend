// Claims fijos del JWT. Al validar issuer y audience se evita que un token
// emitido para otro servicio (o con otro propósito) sea aceptado aquí.
export const JWT_ISSUER = 'petrogassa-landing-backend';
export const JWT_AUDIENCE = 'petrogassa-landing-backend-client';
