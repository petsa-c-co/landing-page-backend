import { ServiceItemsLayout } from '@/services/enum/service-items-layout.enum';

// Contenido EDITORIAL inicial del sitio (servicios y certificaciones), con los
// textos reales de Petrogas. Solo se usa para sembrar la base la primera vez;
// después se administra desde el panel y el seed no vuelve a tocar nada.
//
// NO incluye Well Testing (dado de baja como servicio) ni la certificación de
// transporte (ISO 39001), que la empresa ya no mantiene.

interface SeedServiceItem {
    label: string;
    spec?: string;
    icon?: string;
}

export interface SeedService {
    title: string;
    slug: string;
    shortDescription: string;
    longDescription: string;
    itemsLayout: ServiceItemsLayout;
    sortOrder: number;
    items: SeedServiceItem[];
}

export const INITIAL_SERVICES: SeedService[] = [
    {
        title: "Operación y Mantenimiento",
        slug: "operacion-y-mantenimiento",
        shortDescription: "Outsourcing de Operación y Mantenimiento de Yacimientos de Gas y Petróleo.",
        longDescription: "Servicios integrales de Operación y Mantenimiento de Plantas de Procesamiento de Crudo y Gas.",
        itemsLayout: ServiceItemsLayout.NUMBERED,
        sortOrder: 0,
        items: [
            { label: "Seguridad de Procesos" },
            { label: "Mantenimiento Eléctrico" },
            { label: "Mantenimiento Instrumental Electroneumático" },
            { label: "Mantenimiento Mecánico" },
            { label: "Mantenimiento y Calibración de Válvulas" },
            { label: "Tele Supervisión" },
            { label: "Sistemas Scadas" },
        ],
    },
    {
        title: "Transporte de Personal",
        slug: "transporte-de-personal",
        shortDescription: "Transporte de Personal con flota moderna.",
        longDescription: "Contamos con una flota de Transporte moderna de nivel ejecutivo. Permitiendo dar soluciones dinámicas, adaptadas a cualquier requerimiento de nuestros clientes. Para ello desarrollamos conductores profesionales, altamente calificados.",
        itemsLayout: ServiceItemsLayout.BULLETS,
        sortOrder: 1,
        items: [
            { label: "Pick-Up's", icon: "pickup" },
            { label: "Combis", icon: "combi" },
            { label: "Minibuses", icon: "minibus" },
        ],
    },
];

export interface SeedCertification {
    title: string;
    subtitle: string;
    description: string;
    isFeatured: boolean;
    sortOrder: number;
}

export const INITIAL_CERTIFICATIONS: SeedCertification[] = [
    {
        title: "ISO 9001:2015",
        subtitle: "Calidad",
        description: "Sistema de Gestión de la Calidad orientado a procesos revisables y mejorables, sin fallas ni defectos.",
        isFeatured: false,
        sortOrder: 0,
    },
    {
        title: "ISO 14001:2015",
        subtitle: "Medio Ambiente",
        description: "Gestión Ambiental para un manejo adecuado y sustentable de los recursos en cada una de nuestras tareas.",
        isFeatured: false,
        sortOrder: 1,
    },
    {
        title: "ISO 45001:2018",
        subtitle: "Seguridad y Salud",
        description: "Seguridad y Salud Ocupacional con el objetivo a largo plazo de una tasa de cero accidentes.",
        isFeatured: false,
        sortOrder: 2,
    },
];
