import { Cluster } from "../cluster";
import * as fetch from "node-fetch";
import { hostname } from "os";

export class WorkerServer {
	static async create(host: string, key: string) {
		return fetch(`http://${host}:${Cluster.port}${Cluster.api.registry.createWorker}`, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				key,
				host: hostname()
			})
		}).then(r => r.json());
	}
}