import { Cluster } from "../cluster";
import * as fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import { hostname } from "os";

export class WorkerServer {
	static async create(host: string, key: string) {
		const result = fetch(`http://${host}:${Cluster.port}${Cluster.api.registry.createWorker}`, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				key,
				host: hostname()
			})
		}).then(r => r.json());

		if (!fs.existsSync(this.rootDirectory)) {
			fs.mkdirSync(this.rootDirectory);
		}

		fs.mkdirSync(this.workerDirectory(result.name));
		fs.writeFileSync(WorkerServer.keyFile(result.name), result.key);
		fs.writeFileSync(WorkerServer.hostFile(result.name), host);
	}

	static get rootDirectory() {
		return path.join(Cluster.localDirectory, "workers");
	}

	static workerDirectory(name: string) {
		return path.join(this.rootDirectory, name);
	}

	static keyFile(name: string) {
		return path.join(this.workerDirectory(name), "key");
	}

	static hostFile(name: string) {
		return path.join(this.workerDirectory(name), "host");
	}
}