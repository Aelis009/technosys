import type {
	InputHTMLAttributes,
	ReactNode,
	SelectHTMLAttributes,
	TextareaHTMLAttributes,
} from "react";

interface FormFieldProps {
	id: string;
	label: string;
	required?: boolean;
	hint?: string;
	error?: string;
	children: ReactNode;
	className?: string;
}

export function FormField({
	id,
	label,
	required = false,
	hint,
	error,
	children,
	className = "",
}: FormFieldProps) {
	const hintId = hint ? `${id}-hint` : undefined;
	const errorId = error ? `${id}-error` : undefined;

	return (
		<div className={`flex flex-col gap-1.5 ${className}`}>
			<label htmlFor={id} className="text-sm font-medium text-slate-800">
				{label}
				{required ? (
					<span aria-hidden="true" className="ml-0.5 text-rose-600">
						*
					</span>
				) : null}
			</label>
			{hint ? (
				<p id={hintId} className="text-xs text-slate-500">
					{hint}
				</p>
			) : null}
			{children}
			{error ? (
				<p
					id={errorId}
					role="alert"
					className="text-xs font-medium text-rose-600"
				>
					{error}
				</p>
			) : null}
		</div>
	);
}

export function getFormFieldDescribedBy(
	id: string,
	{ hasHint, hasError }: { hasHint?: boolean; hasError?: boolean },
): string | undefined {
	const ids = [
		hasHint ? `${id}-hint` : null,
		hasError ? `${id}-error` : null,
	].filter(Boolean);
	return ids.length > 0 ? ids.join(" ") : undefined;
}

const baseControlClasses =
	"w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

function controlStateClasses(hasError?: boolean): string {
	return hasError
		? "border-rose-400 focus:border-rose-500"
		: "border-slate-300 hover:border-slate-400 focus:border-brand-600";
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
	hasError?: boolean;
}

export function TextInput({
	hasError = false,
	className = "",
	...props
}: TextInputProps) {
	return (
		<input
			aria-invalid={hasError || undefined}
			className={[baseControlClasses, controlStateClasses(hasError), className]
				.filter(Boolean)
				.join(" ")}
			{...props}
		/>
	);
}

export interface TextareaInputProps
	extends TextareaHTMLAttributes<HTMLTextAreaElement> {
	hasError?: boolean;
}

export function TextareaInput({
	hasError = false,
	className = "",
	rows = 3,
	...props
}: TextareaInputProps) {
	return (
		<textarea
			rows={rows}
			aria-invalid={hasError || undefined}
			className={[baseControlClasses, controlStateClasses(hasError), className]
				.filter(Boolean)
				.join(" ")}
			{...props}
		/>
	);
}

export interface SelectInputProps
	extends SelectHTMLAttributes<HTMLSelectElement> {
	hasError?: boolean;
}

export function SelectInput({
	hasError = false,
	className = "",
	children,
	...props
}: SelectInputProps) {
	return (
		<select
			aria-invalid={hasError || undefined}
			className={[baseControlClasses, controlStateClasses(hasError), className]
				.filter(Boolean)
				.join(" ")}
			{...props}
		>
			{children}
		</select>
	);
}
