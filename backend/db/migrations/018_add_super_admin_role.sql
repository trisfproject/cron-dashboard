-- Migration: 018_add_super_admin_role
-- Description: Adds the SUPER_ADMIN platform governance role to NYX users.

ALTER TABLE users
  MODIFY COLUMN role ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user';

