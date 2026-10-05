// Sample data for trying the app end to end: one branch ("CAVE Karkala") with
// staff, menu, sessions, expenses and a partly ticked checklist, plus the admin PIN.
//
//   npm run db:seed:sample
//
// Idempotent: safe to re-run. Existing data (e.g. other branches) is never touched.
//
// Logins created:
//   Stylist PIN 1234   ·   Manager PIN 4321   ·   Admin PIN 202600
import "dotenv/config";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { PaymentMode, PrismaClient, TransactionType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PinVaultService } from "../src/common/security/pin-vault.service.js";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const lookupSecret = process.env.BRANCH_PIN_LOOKUP_SECRET;
if (!connectionString) throw new Error("DATABASE_URL environment variable is not set");
if (!lookupSecret) throw new Error("BRANCH_PIN_LOOKUP_SECRET environment variable is not set");

const pool = new pg.Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// Same key derivation as the running API, so PINs seeded here can be shown in Admin → Settings.
const vault = new PinVaultService({ get: (k: string) => process.env[k] } as never);

const ADMIN_PIN = "202600";
const STYLIST_PIN = "1234";
const MANAGER_PIN = "4321";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const hash = (pin: string) => bcrypt.hash(pin, 10);
const lookup = (pin: string) =>
  crypto.createHmac("sha256", lookupSecret as string).update(pin).digest("hex");

const stylists = ["Anas", "Arman", "Rahul", "Kiran"];

const menu: [string, number][] = [
  ["Haircut", 300],
  ["Beard", 150],
  ["Hair Wash", 100],
  ["Styling", 200],
  ["Smoothing", 1500],
  ["Straightening", 2000],
  ["Perming", 2500],
  ["Colour", 800],
  ["Head Massage", 250],
  ["Face Clean-up", 350],
  ["D-Tan", 400],
];

async function main() {
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
  const managerRole = await prisma.role.findUniqueOrThrow({ where: { name: "MANAGER" } });
  const stylistRole = await prisma.role.findUniqueOrThrow({ where: { name: "STYLIST" } });

  // ── Admin ────────────────────────────────────────────────────────
  const adminPinHash = await hash(ADMIN_PIN);
  const admin = await prisma.user.findFirst({ where: { roleId: adminRole.id, branchId: null } });
  if (admin) {
    await prisma.user.update({ where: { id: admin.id }, data: { pinHash: adminPinHash, pinEncrypted: vault.encrypt(ADMIN_PIN), isActive: true } });
    console.log(`Admin "${admin.name}": PIN set`);
  } else {
    await prisma.user.create({
      data: { name: "CAVE Admin", email: "admin@cave.com", roleId: adminRole.id, pinHash: adminPinHash, pinEncrypted: vault.encrypt(ADMIN_PIN) },
    });
    console.log("Admin created");
  }

  // ── Branch ───────────────────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { code: "KARKALA" },
    update: {},
    create: {
      name: "CAVE Karkala",
      code: "KARKALA",
      address: "Karkala",
      city: "Karkala",
      state: "Karnataka",
      monthlyTarget: 250000,
    },
  });

  for (const [roleId, pin, label] of [
    [stylistRole.id, STYLIST_PIN, "Stylist"],
    [managerRole.id, MANAGER_PIN, "Manager"],
  ] as const) {
    const clash = await prisma.branchRoleCredential.findUnique({ where: { pinLookup: lookup(pin) } });
    if (clash && !(clash.branchId === branch.id && clash.roleId === roleId)) {
      console.warn(`! ${label} PIN ${pin} is already used by another branch/role - skipped`);
      continue;
    }
    await prisma.branchRoleCredential.upsert({
      where: { branchId_roleId: { branchId: branch.id, roleId } },
      update: { pinHash: await hash(pin), pinLookup: lookup(pin), pinEncrypted: vault.encrypt(pin) },
      create: { branchId: branch.id, roleId, pinHash: await hash(pin), pinLookup: lookup(pin), pinEncrypted: vault.encrypt(pin) },
    });
  }

  // ── Staff ────────────────────────────────────────────────────────
  const staffByName = new Map<string, string>();
  const ensureStaff = async (name: string, roleId: string, flat: number | null) => {
    const existing = await prisma.user.findFirst({ where: { name, branchId: branch.id } });
    if (existing) {
      staffByName.set(name, existing.id);
      return existing.id;
    }
    const user = await prisma.user.create({
      data: {
        name,
        roleId,
        branchId: branch.id,
        ...(flat ? { commissionModel: "FLAT_PERCENTAGE" as const, flatCommissionPercentage: flat } : {}),
      },
    });
    staffByName.set(name, user.id);
    return user.id;
  };
  const managerId = await ensureStaff("Branch Manager", managerRole.id, null);
  for (const name of stylists) await ensureStaff(name, stylistRole.id, 20);
  await prisma.branch.update({ where: { id: branch.id }, data: { managerId } });

  // ── Menu ─────────────────────────────────────────────────────────
  const pricingByName = new Map<string, string>();
  for (const [name, price] of menu) {
    const service = await prisma.service.upsert({ where: { name }, update: {}, create: { name } });
    const pricing = await prisma.branchServicePricing.upsert({
      where: { branchId_serviceId: { branchId: branch.id, serviceId: service.id } },
      update: {},
      create: { branchId: branch.id, serviceId: service.id, price },
    });
    pricingByName.set(name, pricing.id);
  }

  // ── Sessions, expenses (only on a fresh branch) ──────────────────
  if ((await prisma.session.count({ where: { branchId: branch.id } })) === 0) {
    const priceOf = (name: string) => menu.find(([n]) => n === name)![1];

    const customer = async (name: string, phone: string | undefined, visits: number) =>
      phone
        ? prisma.customer.upsert({
            where: { phone },
            update: {},
            create: { name, phone, qualifyingCompletedSessionsCount: visits },
          })
        : null;

    // Active sessions (services are billed when the session is closed).
    const active: [string, string | undefined, string, number][] = [
      ["Rohan M.", "9876543210", "Anas", 35],
      ["Demo 1", undefined, "Anas", 12],
      ["Arjun K.", "9900112233", "Arman", 22],
      ["Vivek S.", undefined, "Kiran", 8],
    ];
    for (const [name, phone, stylist, mins] of active) {
      const c = await customer(name, phone, 0);
      await prisma.session.create({
        data: {
          branchId: branch.id,
          stylistId: staffByName.get(stylist),
          customerId: c?.id,
          customerName: name,
          customerMobile: phone ?? null,
          status: "ACTIVE",
          startedAt: minutesAgo(mins),
          createdAt: minutesAgo(mins),
        },
      });
    }

    // Closed sessions, billed.
    const closed: {
      name: string;
      phone?: string;
      stylist: string;
      services: string[];
      tip: number;
      mode: PaymentMode;
      startedAgo: number;
      closedAgo: number;
    }[] = [
      { name: "Nikhil R.", phone: "9800155667", stylist: "Anas", services: ["Haircut", "Beard"], tip: 50, mode: "GPAY", startedAgo: 180, closedAgo: 140 },
      { name: "Demo", stylist: "Arman", services: ["Haircut"], tip: 0, mode: "CASH", startedAgo: 150, closedAgo: 120 },
      { name: "Suresh P.", phone: "9000144332", stylist: "Anas", services: ["Haircut", "Hair Wash", "Styling"], tip: 100, mode: "GPAY", startedAgo: 120, closedAgo: 85 },
    ];
    for (const s of closed) {
      const c = await customer(s.name, s.phone, 1);
      const subtotal = s.services.reduce((a, n) => a + priceOf(n), 0);
      await prisma.session.create({
        data: {
          branchId: branch.id,
          stylistId: staffByName.get(s.stylist),
          customerId: c?.id,
          customerName: s.name,
          customerMobile: s.phone ?? null,
          status: "COMPLETED",
          subtotal,
          tipAmount: s.tip,
          totalAmount: subtotal + s.tip,
          paymentMode: s.mode,
          startedAt: minutesAgo(s.startedAgo),
          createdAt: minutesAgo(s.startedAgo),
          closedAt: minutesAgo(s.closedAgo),
          isLoyaltyCounted: !!c,
          services: {
            create: s.services.map((n) => ({
              servicePricingId: pricingByName.get(n),
              serviceName: n,
              price: priceOf(n),
            })),
          },
        },
      });
    }

    const expenses = [
      { type: TransactionType.GENERAL_EXPENSE, description: "Towels & Supplies", amount: 850, paymentMode: PaymentMode.CASH, ago: 240 },
      { type: TransactionType.EMPLOYEE_ADVANCE, description: "Salary advance", amount: 2000, paymentMode: PaymentMode.CASH, ago: 120, employee: "Rahul" },
      { type: TransactionType.GENERAL_EXPENSE, description: "Cleaning products", amount: 350, paymentMode: PaymentMode.GPAY, ago: 60 },
    ];
    for (const e of expenses) {
      await prisma.branchTransaction.create({
        data: {
          branchId: branch.id,
          type: e.type,
          description: e.description,
          amount: e.amount,
          paymentMode: e.paymentMode,
          employeeId: e.employee ? staffByName.get(e.employee) : null,
          createdById: managerId,
          createdAt: minutesAgo(e.ago),
        },
      });
    }
    console.log("Seeded 4 active + 3 closed sessions and 3 expenses");
  } else {
    console.log("CAVE Karkala already has sessions - skipped sessions/expenses");
  }

  // ── Checklist: first four tasks already done today ───────────────
  const tasks = await prisma.checklistTask.findMany({
    where: { isActive: true, branchId: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 4,
  });
  const today = new Date(new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10) + "T00:00:00Z");
  for (const t of tasks) {
    await prisma.checklistCompletion.upsert({
      where: { taskId_branchId_date: { taskId: t.id, branchId: branch.id, date: today } },
      update: {},
      create: { taskId: t.id, branchId: branch.id, date: today },
    });
  }

  console.log("\nDone. Stylist PIN 1234 · Manager PIN 4321 · Admin PIN 202600");
}

main()
  .catch((e) => {
    console.error("Sample seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
