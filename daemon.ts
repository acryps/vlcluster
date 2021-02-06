import * as express from "express";
import * as fs from "fs";
import { RegistryServer } from "./registry/registry";
import { Cluster } from "./cluster";
import { WorkerServer } from "./worker/worker";
import { Logger } from "./log";
import { GatewayServer } from "./gateway/gateway";

export class Daemon {
	server;

	async start() {
		const logger = new Logger("daemon");

		process.stdout.write(`\u001b[1m${Cluster.logo}  \u001b[2m${Cluster.version}\u001b[0m\n\n`);

		logger.log("starting vlcluster daemon in '", Cluster.localDirectory, "'");

		this.server = express();
		this.server.use(express.json());

		this.server.get("/up", (req, res) => {
			res.json({
				running: true
			});
		});

		this.server.listen(Cluster.port, () => {
			logger.log("daemon server started");
		});

		for (let cluster of GatewayServer.getInstalledGateways()) {
			if (process.env.USER !== "root") {
				logger.warn("gateways must be run as root!");

				return process.exit(1);
			}

			await logger.process(["starting gateway for ", logger.c(cluster)], async finished => {
				const gateway = new GatewayServer(cluster);
				await gateway.register(this.server);

				finished("started gateway ", logger.cg(cluster, gateway.name));
			});
		}

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
				await worker.register();

				finished("started worker ", logger.cw(cluster, worker.name));
			});
		}
	}
}