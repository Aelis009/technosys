import { type ReactNode, useEffect, useId, useRef } from "react";

type ModalSize = "sm" | "md" | "lg" | "xl";

const modalSizes: Record<ModalSize, string> = {
	sm: "max-w-md",
	md: "max-w-xl",
	lg: "max-w-2xl",
	xl: "max-w-4xl",
};

interface ModalProps {
	open: boolean;
	onClose: () => void;
	title: string;
	description?: string;
	size?: ModalSize;
	closeOnBackdrop?: boolean;
	children: ReactNode;
}

export function Modal({
	open,
	onClose,
	title,
	description,
	size = "md",
	closeOnBackdrop = true,
	children,
}: ModalProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const descriptionId = useId();

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		if (open && !dialog.open) {
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	}, [open]);

	return (
		<dialog
			ref={dialogRef}
			aria-labelledby={titleId}
			aria-describedby={description ? descriptionId : undefined}
			onClose={onClose}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					onClose();
				}
			}}
			onClick={(event) => {
				if (closeOnBackdrop && event.target === dialogRef.current) {
					onClose();
				}
			}}
			className={`app-dialog m-auto w-[calc(100dvw-2rem)] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl ${modalSizes[size]}`}
		>
			<div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
				<div>
					<h2 id={titleId} className="text-lg font-semibold text-slate-900">
						{title}
					</h2>
					{description ? (
						<p id={descriptionId} className="mt-1 text-sm text-slate-600">
							{description}
						</p>
					) : null}
				</div>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close modal"
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						className="h-5 w-5"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M6 18 18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>
			<div className="max-h-[calc(100dvh-10rem)] overflow-y-auto px-6 py-5">
				{children}
			</div>
		</dialog>
	);
}
