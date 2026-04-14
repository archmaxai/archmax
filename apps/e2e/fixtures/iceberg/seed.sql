-- Seed script run by DuckDB CLI against the Lakekeeper REST catalog.
-- Requires iceberg + httpfs extensions (installed by init.sh).
-- Lakekeeper in dev mode does not enforce auth, but we still go through
-- the standard secret+attach flow so the seed mirrors the production path.

CREATE SECRET lakekeeper_seed (
    TYPE iceberg,
    TOKEN 'e2e-seed-token'
);

ATTACH 'e2e_warehouse' AS lake (
    TYPE iceberg,
    ENDPOINT 'http://lakekeeper:8181/catalog',
    SECRET 'lakekeeper_seed'
);

CREATE SCHEMA lake.e2e_test;

CREATE TABLE lake.e2e_test.e2e_shipments (
    id INTEGER,
    product_name VARCHAR,
    shipped_date DATE,
    destination VARCHAR
);

INSERT INTO lake.e2e_test.e2e_shipments VALUES
    (1, 'Widget A', '2024-01-15', 'New York'),
    (2, 'Widget B', '2024-01-16', 'London'),
    (3, 'Widget C', '2024-01-17', 'Berlin');
