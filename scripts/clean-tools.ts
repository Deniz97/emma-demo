import { prisma } from "../lib/prisma";

/**
 * Cleanup script to delete all tool data (methods, classes, apps)
 */
async function main() {
  console.log("Starting cleanup of all tool data...");

  try {
    // Delete all methods
    const deletedMethods = await prisma.method.deleteMany({});
    console.log(`Deleted ${deletedMethods.count} methods`);

    // Delete all classes
    const deletedClasses = await prisma.class.deleteMany({});
    console.log(`Deleted ${deletedClasses.count} classes`);

    // Delete all apps
    const deletedApps = await prisma.app.deleteMany({});
    console.log(`Deleted ${deletedApps.count} apps`);

    console.log("\n✅ Cleanup completed successfully!");
    console.log(
      `   Deleted: ${deletedApps.count} apps, ${deletedClasses.count} classes, ${deletedMethods.count} methods`
    );
  } catch (error) {
    console.error("Cleanup failed:", error);
    throw error;
  }
}

// Run the cleanup
main()
  .catch((error) => {
    console.error("Cleanup failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
