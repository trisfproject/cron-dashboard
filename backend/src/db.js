import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool(config.mysql);

export async function waitForDatabase(logger, retries = 30) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      logger.info('Connected to MySQL');
      return;
    } catch (error) {
      logger.warn({ attempt, error: error.message }, 'Waiting for MySQL');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error('Unable to connect to MySQL');
}

