import { Cluster } from "../cluster";
import * as fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import { hostname } from "os";

export class WorkerServer {
	key: string;
	host: string;

	constructor(clusterName: string) {
		this.key = fs.readFileSync(WorkerServer.keyFile(clusterName)).toString();
		this.host = fs.readFileSync(WorkerServer.hostFile(clusterName)).toString();
	}

	static async create(host: string, key: string) {
		const result = await fetch(`http://${host}:${Cluster.port}${Cluster.api.registry.createWorker}`, {
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

		return {
			name: result.name
		};
	}

	async install(image: string) {
		console.log(`[ worker ] install ${image}`);
	}

	static getInstalledClusterNames() {
		if (!fs.existsSync(this.rootDirectory)) {
			return [];
		}

		return fs.readdirSync(this.rootDirectory);
	}

	static get rootDirectory() {
		return path.join(Cluster.localDirectory, "workers");
	}

	static workerDirectory(clusterName: string) {
		return path.join(this.rootDirectory, clusterName);
	}

	static keyFile(clusterName: string) {
		return path.join(this.workerDirectory(clusterName), "key");
	}

	static hostFile(clusterName: string) {
		return path.join(this.workerDirectory(clusterName), "host");
	}

	register(app) {
		app.post(Cluster.api.worker.install, async (req, res) => {
			if (this.key != req.body.key) {
				throw new Error(`[ registry ]\tinvalid key login attepted`);
			}

			await this.install(req.body.image);

			res.json({
				installed: true
			});
		});
	}
}