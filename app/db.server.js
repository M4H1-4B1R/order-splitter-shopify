import { PrismaClient } from "@prisma/client";

let db;

if (process.env.NODE_ENV !== "production") {
  db = new PrismaClient();
  db.$connect();
  console.log("Connected to db");
} else {
  if (!global.db) {
    global.db = new PrismaClient();
    global.db.$connect();
    console.log("Connected to db");
  }
  db = global.db;
}

export default db;
