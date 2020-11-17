import * as express from "express";
import * as fs from "fs";
import { RegistryServer } from "./registry/registry";
import { Cluster } from "./cluster";
import { WorkerServer } from "./worker/worker";

export class Daemon {
	server;

	constructor() {
		this.server = express();
		this.server.use(express.json());

		this.server.get("/up", (req, res) => {
			res.json({
				running: true
			});
		});

		if (RegistryServer.isInstalled()) {
			const registry = new RegistryServer();
			console.log(`[ daemon ]\tregistry '${registry.name}' active!`);

			registry.register(this.server);
		}

		for (let cluster of WorkerServer.getInstalledClusterNames()) {
			const worker = new WorkerServer(cluster);
			console.log(`[ daemon ]\tworker '${cluster}' from ${worker.host} active!`);

			worker.register(this.server);
		}

		this.server.listen(Cluster.port, () => {
			console.log(`[ daemon ]\tstarted on :${Cluster.port}`);
		});
	}
}