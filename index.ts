import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as readline from "readline";
import { RegistryServer } from "./registry/registry";
import { Cluster } from "./cluster";
import { Daemon } from "./daemon";
import { WorkerServer } from "./worker/worker";
import { Deployer } from "./deploy";
import { Client } from "./client/client";
import { Worker } from "cluster";

export async function main() {
	let parameters = process.argv.slice(2);
	Cluster.rootDirectory = path.resolve(os.homedir(), ".vlcluster");

	if (!fs.existsSync(Cluster.rootDirectory)) {
		fs.mkdirSync(Cluster.rootDirectory);
	}

	const cli = readline.createInterface({
		input: process.stdin,
  		output: process.stdout
	});

	try {
		switch (parameters.shift()) {
			case "init": {
				switch (parameters.shift()) {
					case undefined:
					case "client": {
						console.log(`welcome to vlcluster!`);
						
						cli.question("Enter your email address: ", email => {
							cli.question("Enter your vlcluster registry hostname: ", hostname => {
								cli.question("Enter your vlcluster registry key: ", async key => {
									await Client.create(email, hostname, key);

									process.exit(0);
								});
							});
						});

						break;
					}

					case "registry": {
						const key = await RegistryServer.create(parameters[0]);

						console.log(`created registry!\n\nprivate key: ${key}\nStore this key safely!`);
						return process.exit(0);
					}

					case "worker": {
						const registry = await WorkerServer.create(parameters[0], parameters[1], parameters[2]);
						
						console.log(`created worker!\n\nwelcome to '${registry.name}'!`);
						return process.exit(0);
					}
				}

				break;
			}

			case "deploy": {
				const deployer = new Deployer(
					process.cwd(),
					parameters[0]
				);
				
				const key = await deployer.deploy();

				if (parameters[1]) {
					await deployer.upgrade(key, parameters[1]);
				}

				return process.exit(0);
			}

			case "ps": {
				for (let cluster of WorkerServer.getInstalledClusterNames()) {
					console.group(cluster);

					for (let instance of await new WorkerServer(cluster).getInstances()) {
						console.log(`${instance.running ? "✔ Running" : "✗ Stopped"}\t${instance.application}[${instance.env}]:${instance.version}\tcontainer:${instance.internalPort} → localhost:${instance.externalPort}`);
					}

					console.groupEnd();
				}
			}

			case "daemon": {
				new Daemon();
			}
		}
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
}