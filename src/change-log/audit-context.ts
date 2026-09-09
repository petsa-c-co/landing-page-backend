import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { User } from '@/users/entities/user.entity';

/**
 * Contexto de un request, disponible desde cualquier profundidad sin pasarlo
 * por parámetro.
 *
 * Existe para que el subscriber del registro de cambios sepa QUIÉN hizo cada
 * cambio. Un subscriber de TypeORM no ve el request: solo ve entidades. La
 * alternativa era propagar el usuario por ~36 firmas de controllers y services,
 * que es justo el tipo de cosa que después se olvida en un método y deja un
 * agujero silencioso en la auditoría.
 *
 * Se apoya en AsyncLocalStorage, que es de Node y no suma dependencias.
 */
export interface AuditContext {
    /** El request lo trae; se lee al final, cuando el guard ya lo pobló. */
    getUser: () => User | undefined;
    /** Agrupa todo lo que cambió en un mismo request. */
    requestId: string;
    /** Si está en true, no se registra nada de lo que pase adentro. */
    omitido: boolean;
}

const almacen = new AsyncLocalStorage<AuditContext>();

export const auditContext = {
    /** Abre el contexto de un request. Lo llama el middleware. */
    run<T>(getUser: () => User | undefined, fn: () => T): T {
        return almacen.run(
            { getUser, requestId: randomUUID(), omitido: false },
            fn,
        );
    },

    /**
     * Corre algo SIN registrar los cambios que produzca.
     *
     * Es la excepción deliberada, y hoy tiene exactamente dos usuarios: las
     * siembras del primer arranque. El contenido sembrado no es un cambio, es
     * la emisión inicial —la Rev. 00—; registrarlo quemaría la primera
     * revisión con 146 asientos de "sistema" el día que alguien despliega de
     * nuevo o restaura un backup.
     *
     * Se llama a mano y se puede grepear. Lo contrario —que olvidarse de
     * registrar sea lo fácil— es lo que este diseño evita.
     */
    sinRegistro<T>(fn: () => T): T {
        return almacen.run(
            { getUser: () => undefined, requestId: randomUUID(), omitido: true },
            fn,
        );
    },

    actual(): AuditContext | undefined {
        return almacen.getStore();
    },
};
