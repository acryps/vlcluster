import { sha512 } from "js-sha512";

export class Crypto {
	static createKey() {
		return Array(128).fill(0).map(e => Math.random().toString(36)[3]).map(s => Math.random() > 0.5 ? s.toUpperCase() : s).join("");
	}

	static nameHash(name) {
		return sha512(name).substring(10, 74);
	}

	static dockerImageKey() {
		return sha512(Math.random().toString()).substring(0, 32);
	}

	static hostIdentifier(name: string) {
		return name.replace(/[^\-\_0-9a-z\.]/g, "");
	}

	static sanitizeUsername(name: string) {
		return name.replace(/[^\-\_0-9a-z\.\@]/g, "");
	}

	static sanitizeVersion(name: string) {
		return name.replace(/[^\-\_\.0-9a-z]/g, "");
	}

	static sanitizeApplicationName(name: string) {
		return name.replace(/[^\-\_\@\.0-9a-zA-Z]/g, "");
	}
}