import dotenv from 'dotenv';

dotenv.config();

const required = ['API_KEY', 'DB_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  apiKey: process.env.API_KEY,
  authSecret: process.env.AUTH_SECRET || process.env.API_KEY,
  sessionTtlSeconds: Number(process.env.AUTH_SESSION_TTL_SECONDS || 60 * 60 * 12),
  bootstrapAdminEmail: process.env.NYX_ADMIN_EMAIL || '',
  bootstrapAdminPassword: process.env.NYX_ADMIN_PASSWORD || '',
  bootstrapAdminName: process.env.NYX_ADMIN_NAME || 'NYX Admin',
  logLevel: process.env.LOG_LEVEL || 'info',
  alertEvaluationIntervalMs: Number(process.env.ALERT_EVALUATION_INTERVAL_MS || 60000),
  mysql: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    timezone: 'Z',
    dateStrings: true
  }
};
