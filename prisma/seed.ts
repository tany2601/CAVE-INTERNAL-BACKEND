import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const roles = [
  {
    name: "ADMIN",
    description: "System administrator with full access across all branches",
  },
  {
    name: "MANAGER",
    description: "Branch manager responsible for branch operations and staff",
  },
  {
    name: "STYLIST",
    description: "Salon stylist providing services at an assigned branch",
  },
];

async function main() {
  console.log("Seeding initial roles...");

  for (const role of roles) {
    const seededRole = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: {
        name: role.name,
        description: role.description,
      },
    });
    console.log(`Seeded role: ${seededRole.name} (${seededRole.id})`);
  }

  console.log("Role seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error("Error seeding roles:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
