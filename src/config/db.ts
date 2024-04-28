import * as mysql from "mysql2";

export const dbConfig = {
  host: "localhost",
  user: "root",
  password: "root",
  database: "notebot",
};

export const db = mysql.createConnection(dbConfig);
