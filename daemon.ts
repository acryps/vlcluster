import * as express from "express";
import * as fs from "fs";
import { RegistryServer } from "./registry/registry";
import { Cluster } from "./cluster";
import { WorkerServer } from "./worker/worker";
import { Logger } from "./log";
import { finished } from "stream";

export class Daemon {
	server;

	async start() {
		const logger = new Logger("daemon");

		this.server = express();
		this.server.use(express.json());

		this.server.get("/up", (req, res) => {
			res.json({
				running: true
			});
		});

		if (RegistryServer.isInstalled()) {
			await logger.process(["starting registry"], async finished => {
				const registry = new RegistryServer();
				registry.register(this.server);

				finished("started registry ", logger.c(registry.name));
			});
		}

		for (let cluster of WorkerServer.getInstalledClusterNames()) {
			await logger.process(["starting worker for ", logger.c(cluster)], async finished => {
				const worker = new WorkerServer(cluster);

				worker.register(this.server);
				worker.startCPUMonitoring();
				worker.startPing();

				finished("started worker ", logger.cw(cluster, worker.name));
			});
		}

		this.server.listen(Cluster.port, () => {
			logger.log("server started");
		});
	}
}