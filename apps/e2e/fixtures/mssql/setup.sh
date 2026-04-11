#!/bin/bash
# Wait for MSSQL to become ready, then run seed SQL.
# Executed by the mssql-init service after mssql is healthy.

for i in $(seq 1 30); do
  /opt/mssql-tools18/bin/sqlcmd -S mssql -U sa -P "$MSSQL_SA_PASSWORD" -No -Q "SELECT 1" > /dev/null 2>&1 && break
  sleep 2
done

/opt/mssql-tools18/bin/sqlcmd -S mssql -U sa -P "$MSSQL_SA_PASSWORD" -No -d e2e_test -i /seed/init.sql
