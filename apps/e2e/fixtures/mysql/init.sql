CREATE TABLE e2e_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL
);

INSERT INTO e2e_orders (product_name, quantity) VALUES
  ('Widget A', 10),
  ('Widget B', 5),
  ('Widget C', 2);
