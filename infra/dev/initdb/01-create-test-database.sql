-- Development only (infra/docker-compose.dev.yml): a throwaway database for the migration tests
-- (`pytest -m db`). They downgrade to an empty schema, so they refuse any database not named *_test.
CREATE DATABASE site_test OWNER site;
