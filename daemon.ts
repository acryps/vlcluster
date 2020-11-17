import * as express from "express";
import * as fs from "fs";
import { RegistryServer } from "./registry/registry";
import { Cluster } from "./cluster";

export class Daemon {
	server;

	constructor() {
		this.server = express();
		this.server.use(express.json());

		if (RegistryServer.isInstalled()) {
			const registry = new RegistryServer();

			console.log(`[ daemon ]\tregistry '${registry.name}' active!`);

			registry.register(this.server);
		}

		this.server.listen(Cluster.port, () => {
			console.log(`[ daemon ]\tstarted on :${Cluster.port}`);
		});
	}
}