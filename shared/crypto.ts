import { sha512 } from "js-sha512";

import * as net from "net";

export class Crypto {
	static createKey() {
		return Array(128).fill(0).map(e => Math.random().toString(36)[3]).map(s => Math.random() > 0.5 ? s.toUpperCase() : s).join("");
	}

	static createId(...hints) {
		return `${hints.length ? `${hints.map(h => (h || "").replace(/[^a-z]/, "").padEnd(16, "-").substring(0, Math.floor(16 / hints.length))).join("")}-` : ""}${Array(hints.length ? 16 : 32).fill(0).map(e => Math.random().toString(16)[3]).join("")}`;
	}

	static nameHash(...name: string[]) {
		return sha512(name.join("")).substring(10, 74);
	}

	static dockerImageKey() {
		return sha512(Math.random().toString()).substring(0, 32);
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