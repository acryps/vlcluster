export class Crypto {
	static createKey() {
		return Array(128).fill(0).map(e => Math.random().toString(36)[3]).map(s => Math.random() > 0.5 ? s.toUpperCase() : s).join("");
	}

	static hostIdentifier(name: string) {
		return name.replace(/[^\-\_0-9a-z\.]/g, "");
	}
}