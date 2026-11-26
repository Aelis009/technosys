import { CategoryError } from "./admin-model.ts";

export async function requireCategoryAdmin() {
	const { AuthenticationError, AuthorizationError, requireRole } = await import(
		"../../auth/session.ts"
	);
	try {
		const { id, name, roles } = await requireRole("admin");
		return { id, name: name ?? "Administrator", roles };
	} catch (error) {
		if (
			error instanceof AuthenticationError ||
			error instanceof AuthorizationError
		)
			throw new CategoryError(error.status, error.message);
		throw error;
	}
}
