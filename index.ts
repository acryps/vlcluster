import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as readline from "readline";
import { RegistryServer } from "./registry/registry";
import { Cluster } from "./cluster";
import { Daemon } from "./daemon";
import { WorkerServer } from "./worker/worker";
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

					case "endpoint": {
						const worker = new WorkerServer(parameters[0]);
						worker.setLocalPath(parameters[1]);

						console.log(`local path assigned`);
					}
				}

				break;
			}

			case "build": {
				await Client.build(parameters[0] || ".");

				return process.exit(0);
			}

			case "push": {
				const client = new Client(parameters[0]);
				await client.push(parameters[1], parameters[2]);

				return process.exit(0);
			}

			case "upgrade": {
				const client = new Client(parameters[0]);
				await client.upgrade(parameters[1], parameters[2], parameters[3]);

				return process.exit(0);
			}

			case "deploy": {
				const client = new Client(parameters[0]);
				await client.deploy(parameters[2] || ".", parameters[1]);

				return process.exit(0);
			}

			case "daemon": {
				const daemon = new Daemon();

				daemon.start();
			}
		}
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
}