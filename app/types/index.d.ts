export interface User {
    id: number | string;
    name: string;
    email: string;
    sex?: string | number;
    age?: number;
}

export type { UserPrisma } from "~~/generated/prisma/client" 