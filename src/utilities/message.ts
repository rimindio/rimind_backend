export function parseMessage<T>(message: string): T {
	const lines = message.split("\n");

	const data: T = {} as T;

	for (const line of lines) {
		const [key, value] = line.split(": ");

		if (!key) continue;

		const lowerCamelCaseKey = key?.charAt(0).toLowerCase() + key?.slice(1);

		data[lowerCamelCaseKey as keyof T] = value as T[keyof T];
	}

	return data;
}

export function buildMessage<T extends Record<string, string>>(data: T) {
	const lines = Object.entries(data).map(([key, value]) => {
		const upperCamelCaseKey = key.charAt(0).toUpperCase() + key.slice(1);
		return `${upperCamelCaseKey}: ${value}`;
	});
	return lines.join("\n");
}
