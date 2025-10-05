import { createClient, type RedisClientType } from "redis";

class RedisService {
  private static instance: RedisService;
  private client!: RedisClientType;

  private constructor() {}

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  public async init(): Promise<void> {
    if (this.client?.isOpen) return;

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error("Redis URL not set!");

    this.client = createClient({ url: redisUrl });

    this.client.on("error", (error) => {
      console.error("Redis Client Error:", error);
    });

    await this.client.connect();
    console.log("Connected to Redis!");
  }

  public getClient(): RedisClientType {
    if (!this.client || !this.client.isOpen) {
      throw new Error("Redis client not connected. Call init() first.");
    }
    return this.client;
  }

  public async disconnect(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
      console.log("Redis connection closed.");
    }
  }
}

const redisService = RedisService.getInstance();

export default redisService;
