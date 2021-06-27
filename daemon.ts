import * as express from "express";
import * as fs from "fs";
import { spawn } from "child_process";

import { RegistryServer } from "./registry/registry";
import { Cluster } from "./shared/cluster";
import { WorkerServer } from "./worker/worker";
import { Logger } from "./shared/log";
import { GatewayServer } from "./gateway/gateway";
import { Configuration } from "./shared/configuration";

export class Daemon {
	server;

	async start() {
		const logger = new Logger("daemon");

		process.stdout.write(`\u001b[1m${Cluster.logo}  \u001b[2m${Cluster.version}\u001b[0m\n\n`);

		logger.log("starting vlcluster daemon in '", Cluster.rootDirectory, "'");

		this.server = express();
		this.server.use(express.json());

		this.server.listen(Cluster.port, () => {
			logger.log("daemon server started");
		});

		for (let gateway of Configuration.gateways) {
			if (process.env.USER !== "root") {
				logger.warn("gateways must be run as root!");

				return process.exit(1);
			}

			logger.log("starting gateway ", logger.cg(gateway.clusterHost, gateway.name));

			const server = new GatewayServer(gateway);
			await server.register(this.server);

			logger.log("started gateway ", logger.cg(gateway.clusterHost, gateway.name));
		}

		if (Configuration.registry) {
			logger.log("starting registry ", logger.c(Configuration.registry.name));

			const server = new RegistryServer(Configuration.registry);
			server.register(this.server);

			logger.log("started registry ", logger.c(Configuration.registry.name));
		}

		for (let worker of Configuration.workers) {
			logger.log("starting worker ", logger.cw(worker.clusterName, worker.name));

			const server = new WorkerServer(worker);
			await server.register(this.server);

			logger.log("started worker ", logger.cw(worker.clusterName, worker.name));
		}
	}

	async install(user: string) {
		await this.checkSystemctl();

		const executeable = process.argv[1];

		try {
			fs.writeFileSync("/etc/systemd/system/vlc2.service", `[Unit]
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
			const systemctl = spawn("systemctl", ["start", "vlc2"]);

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
			const systemctl = spawn("systemctl", ["enable", "vlc2"]);

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