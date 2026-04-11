CREATE TABLE e2e_customers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(255) NOT NULL,
  email NVARCHAR(255) NOT NULL
);

INSERT INTO e2e_customers (name, email) VALUES
  (N'Alice', N'alice@example.com'),
  (N'Bob', N'bob@example.com'),
  (N'Carol', N'carol@example.com');
