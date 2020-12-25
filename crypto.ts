import { sha512 } from "js-sha512";

import * as net from "net";

export class Crypto {
	static createKey() {
		return Array(128).fill(0).map(e => Math.random().toString(36)[3]).map(s => Math.random() > 0.5 ? s.toUpperCase() : s).join("");
	}

	static createId() {
		return Array(16).fill(0).map(e => Math.random().toString(16)[3]).join("");
	}

	static nameHash(...name: string[]) {
		return sha512(name.join("")).substring(10, 74);
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

	static sanitizeWorkerName(name: string) {
		return name.replace(/[^\-\_\@\.0-9a-zA-Z]/g, "");
	}

	static sanitizeGatewayName(name: string) {
		return name.replace(/[^\-\_\@\.0-9a-zA-Z]/g, "");
	}

	static sanitizeInstanceName(name: string) {
		return name.replace(/[^0-9a-zA-Z]/g, "");
	}

	static sanitizeEnv(name: string) {
		return name.replace(/[^\-\_\@0-9a-zA-Z]/g, "");
	}

	static getRandomPort() {
		return new Promise<number>(done => {
			const server = net.createServer(() => {});

			server.listen(0, () => {
				const port = (server.address() as net.AddressInfo).port;

				server.close(() => {
					done(port);
				});
			});
		});
	}
}