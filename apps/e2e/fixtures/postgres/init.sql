CREATE TABLE e2e_products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL
);

INSERT INTO e2e_products (name, price) VALUES
  ('Widget A', 9.99),
  ('Widget B', 19.99),
  ('Widget C', 29.99);
