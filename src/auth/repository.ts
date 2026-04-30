import { eq } from "drizzle-orm";
import { db } from "../db/connection";
import { users, refreshTokens, type User, type NewUser, type NewRefreshToken } from "../db/schema";

export interface IAuthRepository {
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  findAll(): Promise<User[]>;
  createUser(input: NewUser): Promise<User>;
  updateUser(id: string, input: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<User | undefined>;
  createRefreshToken(input: NewRefreshToken): Promise<void>;
  findRefreshTokenByToken(token: string): Promise<(typeof refreshTokens.$inferSelect) | undefined>;
  deleteRefreshToken(token: string): Promise<void>;
  deleteAllUserRefreshTokens(userId: string): Promise<void>;
}

export class DrizzleAuthRepository implements IAuthRepository {
  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async findById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async findAll(): Promise<User[]> {
    return db.select().from(users).orderBy(users.createdAt);
  }

  async createUser(input: NewUser): Promise<User> {
    const [user] = await db.insert(users).values(input).returning();
    return user;
  }

  async updateUser(id: string, input: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(input).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: string): Promise<User | undefined> {
    const [user] = await db.delete(users).where(eq(users.id, id)).returning();
    return user;
  }

  async createRefreshToken(input: NewRefreshToken): Promise<void> {
    await db.insert(refreshTokens).values(input);
  }

  async findRefreshTokenByToken(token: string) {
    const [stored] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, token));
    return stored;
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  }

  async deleteAllUserRefreshTokens(userId: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  }
}
