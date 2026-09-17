import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService (integration)', () => {
  const prisma = new PrismaService();
  const users = new UsersService(prisma);
  const createdProfileIds: string[] = [];

  const makeProfile = async (label: string) => {
    const profile = await prisma.profile.create({
      data: {
        displayName: `Test ${label}`,
        email: `test-users-${Date.now()}-${Math.random().toString(36).slice(2)}@abro.test`,
      },
    });
    createdProfileIds.push(profile.id);
    return profile;
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.profile.deleteMany({ where: { id: { in: createdProfileIds } } });
    await prisma.$disconnect();
  });

  it('updates the given fields and leaves others untouched', async () => {
    const profile = await makeProfile('A');

    const updated = await users.updateProfile(profile.id, { displayName: 'New Name' });

    expect(updated.displayName).toBe('New Name');
    expect(updated.email).toBe(profile.email);
  });

  it('updates preferredCurrency and locale together', async () => {
    const profile = await makeProfile('B');

    const updated = await users.updateProfile(profile.id, {
      preferredCurrency: 'ETB',
      locale: 'am-ET',
    });

    expect(updated.preferredCurrency).toBe('ETB');
    expect(updated.locale).toBe('am-ET');
  });

  it('applying an empty update leaves the profile unchanged', async () => {
    const profile = await makeProfile('C');

    const updated = await users.updateProfile(profile.id, {});

    expect(updated.displayName).toBe(profile.displayName);
    expect(updated.email).toBe(profile.email);
  });
});
