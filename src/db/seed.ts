import { closeDb, db } from "./index.ts";
import { roles, serviceCategories } from "./schema.ts";

const initialRoles = [
	{ name: "admin", description: "System administrator" },
	{ name: "customer", description: "Customer using home services" },
	{ name: "technician", description: "Technician providing home services" },
];

const initialServiceCategories = [
	{
		name: "Home Cleaning",
		description: "Residential home cleaning services",
	},
	{
		name: "Plumbing",
		description: "Residential plumbing services",
	},
	{
		name: "Electrical",
		description: "Residential electrical services",
	},
	{
		name: "Appliance Repair",
		description: "Repair and maintenance for home appliances",
	},
	{
		name: "Painting",
		description: "Residential painting services",
	},
	{
		name: "Carpentry",
		description: "Residential carpentry and furniture services",
	},
];

async function seedInitialData(): Promise<void> {
	const inserted = await db.transaction(async (transaction) => {
		const insertedRoles = await transaction
			.insert(roles)
			.values(initialRoles)
			.onConflictDoNothing({ target: roles.name })
			.returning({ id: roles.id });

		const insertedCategories = await transaction
			.insert(serviceCategories)
			.values(initialServiceCategories)
			.onConflictDoNothing({ target: serviceCategories.name })
			.returning({ id: serviceCategories.id });

		return {
			roles: insertedRoles.length,
			serviceCategories: insertedCategories.length,
		};
	});

	console.info(
		`Database seed complete: inserted ${inserted.roles} roles and ${inserted.serviceCategories} service categories; existing records were left unchanged.`,
	);
}

async function main(): Promise<void> {
	try {
		await seedInitialData();
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown database error";
		console.error(`Database seed failed: ${message}`);
		process.exitCode = 1;
	} finally {
		await closeDb();
	}
}

void main();
