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

const defaultChecklist = [
  { task: "Open workstation", description: "Unlock drawers, turn on lights" },
  { task: "Clean and sanitize tools", description: "Scissors, clippers, combs" },
  { task: "Check towels", description: "Minimum 10 clean towels ready" },
  { task: "Restock products", description: "Shampoo, conditioner, styling products" },
  { task: "Sanitize chair", description: "Wipe down with disinfectant" },
  { task: "Check appointment list", description: "Review today's bookings if any" },
  { task: "Close workstation", description: "Lock drawers, cover chair" },
];

const defaultProducts = [
  {
    name: "Matte Clay",
    price: 599,
    imageUrl: "https://images.unsplash.com/photo-1621607512214-68297480165e?w=500&h=300&fit=crop&auto=format&q=80",
  },
  {
    name: "Beard Oil",
    price: 449,
    imageUrl: "https://images.unsplash.com/photo-1627875777089-d6c3f5ecf129?w=500&h=300&fit=crop&auto=format&q=80",
  },
  {
    name: "Daily Shampoo",
    price: 399,
    imageUrl: "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=500&h=300&fit=crop&auto=format&q=80",
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

  // Default retail products. Only seeded when the catalogue is empty.
  if ((await prisma.product.count()) === 0) {
    await prisma.product.createMany({ data: defaultProducts });
    console.log(`Seeded ${defaultProducts.length} default products.`);
  }

  // Default daily checklist (all branches). Only seeded when no tasks exist yet.
  const existingTasks = await prisma.checklistTask.count();
  if (existingTasks === 0) {
    await prisma.checklistTask.createMany({
      data: defaultChecklist.map((t, i) => ({ ...t, sortOrder: i + 1 })),
    });
    console.log(`Seeded ${defaultChecklist.length} default checklist tasks.`);
  }
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
