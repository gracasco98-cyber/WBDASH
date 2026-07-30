import type { User } from '@prisma/client';

export const sampleUsers: Omit<User, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // Auth tests popoleranno.
];
