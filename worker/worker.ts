import { Cluster } from "../cluster";
import { fetch } from "node-fetch";
import { hostname } from "os";

export class WorkerServer {
	static async create(host: string, key: string) {
		return fetch(`${host}${Cluster.api.registry.createWorker}`, {
			body: JSON.stringify({
				key,
				host: hostname()
			})
		}).then(r => r.json());
	}
}