import { Cluster } from "../cluster";
import * as fetch from "node-fetch";
import { hostname } from "os";

export class WorkerServer {
	static async create(host: string, key: string) {
		return fetch(`${host}:${Cluster.port}${Cluster.api.registry.createWorker}`, {
			method: "POST",
			body: JSON.stringify({
				key,
				host: hostname()
			})
		}).then(r => r.json());
	}
}