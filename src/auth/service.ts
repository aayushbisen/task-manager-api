import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import type { IAuthRepository } from "./repository";
import type { RegisterInput, LoginInput, UpdateProfileInput, AuthTokens, JwtPayload } from "./schema.zod";
import { ValidationError, DuplicateResourceError } from "../errors";
import type { User } from "../db/schema";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthService {
  constructor(private repository: IAuthRepository) {}

  async register(input: RegisterInput): Promise<AuthTokens> {
    const existing = await this.repository.findByEmail(input.email);
    if (existing) {
      throw new DuplicateResourceError("User", "email");
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await this.repository.createUser({
      id: crypto.randomUUID(),
      email: input.email,
      passwordHash,
      name: input.name ?? null,
    });

    return this.generateAndStoreTokens(user);
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await this.repository.findByEmail(input.email);
    if (!user) {
      throw new ValidationError("Invalid email or password");
    }

    const validPassword = await argon2.verify(user.passwordHash, input.password);
    if (!validPassword) {
      throw new ValidationError("Invalid email or password");
    }

    return this.generateAndStoreTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const stored = await this.repository.findRefreshTokenByToken(refreshToken);

    if (!stored) {
      throw new ValidationError("Invalid refresh token");
    }

    if (new Date(stored.expiresAt) < new Date()) {
      await this.repository.deleteRefreshToken(refreshToken);
      throw new ValidationError("Refresh token expired");
    }

    await this.repository.deleteRefreshToken(refreshToken);

    const user = await this.repository.findById(stored.userId);
    if (!user) {
      throw new ValidationError("User not found");
    }

    return this.generateAndStoreTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.repository.deleteRefreshToken(refreshToken);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.repository.deleteAllUserRefreshTokens(userId);
  }

  private async generateAndStoreTokens(user: User): Promise<AuthTokens> {
    const rawRefreshToken = randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS).toISOString();

    await this.repository.createRefreshToken({
      id: crypto.randomUUID(),
      userId: user.id,
      token: rawRefreshToken,
      expiresAt,
    });

    const accessToken = this.generateAccessToken(user);

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private generateAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      throw new ValidationError("Invalid or expired access token");
    }
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.repository.findById(id);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
    const user = await this.repository.findById(userId);
    if (!user) throw new ValidationError("User not found");

    if (input.newPassword) {
      if (!input.currentPassword) {
        throw new ValidationError("Current password is required to set a new password");
      }
      const valid = await argon2.verify(user.passwordHash, input.currentPassword);
      if (!valid) throw new ValidationError("Current password is incorrect");
    }

    const updates: Partial<User> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.email !== undefined) updates.email = input.email;
    if (input.newPassword) updates.passwordHash = await argon2.hash(input.newPassword);
    updates.updatedAt = new Date().toISOString();

    const updated = await this.repository.updateUser(userId, updates);
    if (!updated) throw new ValidationError("Failed to update profile");
    return updated;
  }

  async getAllUsers(): Promise<User[]> {
    return this.repository.findAll();
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.repository.findById(id);
    if (!user) throw new ValidationError("User not found");
    await this.repository.deleteUser(id);
  }
}
