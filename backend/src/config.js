import dotenv from 'dotenv';

dotenv.config();

const required = ['API_KEY', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  apiKey: process.env.API_KEY,
  logLevel: process.env.LOG_LEVEL || 'info',
  mysql: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    timezone: 'Z',
    dateStrings: true
  }
};
