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
import { GatewayServer } from "./gateway/gateway";

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

					// vlcluster init registry <name>
					case "registry": {
						const key = await RegistryServer.create(parameters[0]);

						console.log(`created registry!\n\nprivate key: ${key}\nStore this key safely!`);
						return process.exit(0);
					}

					// vlcluster init worker <host> <name> <key>
					case "worker": {
						const registry = await WorkerServer.create(parameters[0], parameters[1], parameters[2]);
						
						console.log(`created worker!\n\nwelcome to '${registry.name}'!`);
						return process.exit(0);
					}

					// vlcluster init endpoint <cluster> <host>
					case "endpoint": {
						const worker = new WorkerServer(parameters[0]);
						worker.setLocalPath(parameters[1]);

						console.log(`local path assigned`);
						return process.exit(0);
					}

					// vlcluster init gateway <clusterHost> <clusterKey> <name> <endpointHost>
					case "gateway": {
						await GatewayServer.create(parameters[0], parameters[1], parameters[2], parameters[3]);

						console.log(`gateway created`);
						return process.exit(0);
					}

					default: {
						console.error("invalid init");
						return process.exit(1);
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

			// vlcluster deploy <cluster> <env> [<cwd>]
			case "deploy": {
				const client = new Client(parameters[0]);
				await client.deploy(parameters[2] || ".", parameters[1]);

				return process.exit(0);
			}

			// vlcluster set <cluster> <name> <value> [<application>] [<env>]
			case "set": {
				const client = new Client(parameters[0]);
				await client.set(
					parameters[1],
					parameters[2],
					parameters[3],
					parameters[4]
				);

				return process.exit(0);
			}
			
			case "vars": {
				const client = new Client(parameters[0]);
				await client.listVars(
					parameters[1],
					parameters[2]
				);

				return process.exit(0);
			}

			case "map": {
				switch (parameters.shift()) {
					// vlcluster map domain <cluster> <host> <port> <application> <env>
					case "domain": {
						const client = new Client(parameters[0]);
						await client.mapDomain(parameters[1], +parameters[2], parameters[3], parameters[4]);
		
						return process.exit(0);
					}

					// vlcluster map websocket <cluster> <host> <port> <path>
					case "websocket": {
						const client = new Client(parameters[0]);
						await client.mapWebSocket(parameters[1], +parameters[2], parameters[3]);

						return process.exit(0);
					}

					default: {
						console.error("invalid map");
						return process.exit(1);
					}
				}
			}

			case "ssl": {
				switch (parameters.shift()) {
					case "enable": {
						const client = new Client(parameters[0]);
						await client.enableSSL(parameters[1], +parameters[2] || 443);

						return process.exit(0);
					}

					default: {
						console.error("invalid ssl command");

						return process.exit(1);
					}
				}
			}

			case "daemon": {
				const daemon = new Daemon();
				daemon.start();

				break;
			}

			default: {
				console.error("invalid command");
				return process.exit(1);
			}
		}
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
}