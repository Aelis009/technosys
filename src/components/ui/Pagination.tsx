import { Button } from "./Button";

export function Pagination({
	page,
	totalItems,
	pageSize,
	onPageChange,
}: {
	page: number;
	totalItems: number;
	pageSize: number;
	onPageChange: (page: number) => void;
}) {
	const pages = Math.max(1, Math.ceil(totalItems / pageSize));
	const current = Math.min(Math.max(page, 1), pages);
	const first = totalItems === 0 ? 0 : (current - 1) * pageSize + 1;
	const last = Math.min(current * pageSize, totalItems);
	return (
		<nav
			aria-label="Pagination"
			className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600"
		>
			<p aria-live="polite">
				{first}–{last} of {totalItems}
			</p>
			<div className="flex items-center gap-3">
				<Button
					variant="outline"
					size="sm"
					disabled={current <= 1}
					onClick={() => onPageChange(current - 1)}
				>
					Previous
				</Button>
				<span>
					Page {current} of {pages}
				</span>
				<Button
					variant="outline"
					size="sm"
					disabled={current >= pages}
					onClick={() => onPageChange(current + 1)}
				>
					Next
				</Button>
			</div>
		</nav>
	);
}
