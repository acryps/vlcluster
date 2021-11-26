import { sha512 } from "js-sha512";

import * as net from "net";

export class Crypto {
	static createKey() {
		return Array(128).fill(0).map(e => Math.random().toString(36)[3]).map(s => Math.random() > 0.5 ? s.toUpperCase() : s).join("");
	}

	static createId(...hints: string[]) {
		let id = "";

		for (let i = 0; i < hints.length; i++) {
			id = `${hints[hints.length - i - 1].replace(/[^a-z0-9\.]/g, "").substring(0, 16)}-${id}`;
		}

		const length = Math.max(0, 24 - id.length) + 8;

		for (let i = 0; i < length; i++) {
			id += Math.random().toString(16)[3];
		}

		return id;
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