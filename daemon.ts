import * as express from "express";
import * as fs from "fs";
import { spawn } from "child_process";

import { RegistryServer } from "./registry/registry";
import { Cluster } from "./shared/cluster";
import { WorkerServer } from "./worker/worker";
import { Logger } from "./shared/log";
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

	async install(user: string) {
		await this.checkSystemctl();

		const executeable = process.argv[1];

		try {
			fs.writeFileSync("/etc/systemd/system/vlcluster.service", `[Unit]
Description=vlcluster daemon server
After=network.target
		
[Service]
Type=simple
Restart=always
RestartSec=5
StartLimitIntervalSec=0
User=${user}
ExecStart=${executeable} daemon
		
[Install]
WantedBy=multi-user.target`);
		} catch (error) {
			throw new Error(`Cannot write service file! Are you running as root? (${error})`);
		}

		await this.startSystemdService();
		await this.enableSystemdService();
	}

	startSystemdService() {
		return new Promise((done, reject) => {
			const systemctl = spawn("systemctl", ["start", "vlcluster"]);

			systemctl.on("exit", code => {
				if (code) {
					reject(`systemctl start failed with exit code: ${code}`);
				} else {
					done(true);
				}
			});
		});
	}

	enableSystemdService() {
		return new Promise((done, reject) => {
			const systemctl = spawn("systemctl", ["enable", "vlcluster"]);

			systemctl.on("exit", code => {
				if (code) {
					reject(`systemctl enable failed with exit code: ${code}`);
				} else {
					done(true);
				}
			});
		});
	}

	checkSystemctl() {
		return new Promise((done, reject) => {
			const systemctl = spawn("systemctl", ["--version"]);

			systemctl.on("error", () => {
				reject("systemctl is required to install vlcluster as a daemon service!");
			});

			systemctl.on("exit", () => {
				done(true);
			});
		});
	}
}