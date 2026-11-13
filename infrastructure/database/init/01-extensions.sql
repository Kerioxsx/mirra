-- Runs once when the Postgres container initialises (as superuser).
-- Migrations also call CREATE EXTENSION IF NOT EXISTS, which is a no-op once these exist.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;

-- A separate database for the backend test suite.
CREATE DATABASE mirra_test OWNER mirra;
\c mirra_test
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;
