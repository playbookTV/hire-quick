// Deliberately no database client/import/connection: auth selects are modelled in memory.
export const state = {
  user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'ADMIN', status: 'ACTIVE' },
  missing: false,
  revoked: new Set<string>(),
};
export const prisma = {
  user: {
    async findUnique({ where, select }: { where: { id: string }; select: Record<string, boolean> }) {
      if (state.missing || where.id !== state.user.id) return null;
      return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, state.user[key as keyof typeof state.user]]));
    },
  },
  revokedToken: {
    async findUnique({ where }: { where: { jti: string } }) {
      return state.revoked.has(where.jti) ? { jti: where.jti } : null;
    },
    async createMany({ data }: { data: Array<{ jti: string }> }) {
      data.forEach(({ jti }) => state.revoked.add(jti));
      return { count: data.length };
    },
  },
};
