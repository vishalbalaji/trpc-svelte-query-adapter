export function debounce<T>(cb: (v: T) => void, durationMs: number) {
	let timer: ReturnType<typeof setTimeout>;
	return (v: T) => {
		clearTimeout(timer);
		timer = setTimeout(() => cb(v), durationMs);
	};
}
