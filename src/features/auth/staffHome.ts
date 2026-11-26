export function getStaffHome(
	roles: readonly string[],
	canAccessDashboard: boolean,
) {
	if (roles.includes("admin")) return "/admin/dashboard";
	if (roles.includes("technician")) {
		return getTechnicianHome(canAccessDashboard);
	}
	return undefined;
}
export function getTechnicianHome(canAccessDashboard: boolean) {
	return canAccessDashboard ? "/technician/dashboard" : "/technician/status";
}
