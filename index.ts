import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as readline from "readline";
import { RegistryServer } from "./registry/registry";
import { Cluster } from "./shared/cluster";
import { Daemon } from "./daemon";
import { WorkerServer } from "./worker/worker";
import { Client } from "./client/client";
import { Worker } from "cluster";
import { GatewayServer } from "./gateway/gateway";
import { CLI } from "./cli";
import { Logger } from "./shared/log";
import { DeployClientController } from "./client/controllers/deploy";
import { CreateRegistryController } from "./registry/controllers/create";
import { Configuration } from "./shared/configuration";
import { count } from "console";

export async function main() {
	let parameters = process.argv.slice(2);
	Cluster.rootDirectory = path.resolve(os.homedir(), ".vlcluster");
	Configuration.load();

	if (!fs.existsSync(Cluster.rootDirectory)) {
		fs.mkdirSync(Cluster.rootDirectory);
	}

	try {
		switch (parameters.shift()) {
			case "init": {
				switch (parameters.shift()) {
					case undefined:
					case "client": {
						console.log(`welcome to vlcluster!`);

						await Client.create(
							await CLI.getArgument(["-e", "--email"], "Your email"), 
							await CLI.getArgument(["-h", "--hostname"], "Registry hostname"),
							await CLI.getArgument(["-k", "--key"], "Registry key")
						)

						return process.exit(0);

						break;
					}

					case "registry": {
						const key = await CreateRegistryController.registry(
							await CLI.getArgument(["-n", "--name"], "Registry name")
						);

						console.log(`created registry!\n\nprivate key: ${key}\nStore this key safely!`);
						
						return process.exit(0);
					}

					case "worker": {
						const registry = await WorkerServer.create(
							await CLI.getArgument(["-h", "--hostname"], "Registry hostname"),
							await CLI.getArgument(["-k", "--key"], "Registry key"),
							await CLI.getArgument(["-n", "--name"], "Worker name"),
							await CLI.getArgument(["-e", "--endpoint"], "Worker endpoint")
						);
						
						console.log(`created worker!\n\nwelcome to '${registry.name}'!`);
						return process.exit(0);
					}

					case "gateway": {
						await GatewayServer.create(
							await CLI.getArgument(["-h", "--hostname"], "Cluster hostname"),
							await CLI.getArgument(["-k", "--key"], "Cluster key"),
							await CLI.getArgument(["-n", "--name"], "Gateway name"),
							await CLI.getArgument(["-e", "--endpoint"], "Endpoint host")
						);

						console.log(`gateway created`);
						return process.exit(0);
					}

					default: {
						console.error("invalid init command");
						return process.exit(1);
					}
				}

				break;
			}

			case "build": {
				await DeployClientController.build(
					await CLI.getArgument([1, "-p", "--project-path"]) || ".",
					await CLI.getArgument([1, "-d", "--dockerfile"])
				);

				return process.exit(0);
			}

			case "push": {
				await (await Client.getActiveClient()).deploy.push(
					await CLI.getArgument([1, "-a", "--application"], "Application name"),
					await CLI.getArgument([2, "-v", "--version"], "Application version")
				);

				return process.exit(0);
			}

			case "upgrade": {
				await (await Client.getActiveClient()).deploy.upgrade(
					await CLI.getArgument([1, "-a", "--application"], "Application name"),
					await CLI.getArgument([2, "-v", "--version"], "Application version"),
					await CLI.getArgument([3, "-e", "--env"], "Environnement"),
					+(await CLI.getArgument(["-i", "--instances"]) || 1)
				);

				return process.exit(0);
			}

			case "deploy": {
				await (await Client.getActiveClient()).deploy.deploy(
					await CLI.getArgument([2, "-p", "--project-path"]) || ".", 
					await CLI.getArgument([1, "-e", "--env"], "Environnement"),
					+(await CLI.getArgument(["-i", "--instances"]) || 1)
				);

				return process.exit(0);
			}

			case "var": {
				switch (parameters.shift()) {
					case "set": {
						await (await Client.getActiveClient()).variables.set(
							await CLI.getArgument([2, "-n", "--name"], "Variable name"),
							await CLI.getArgument([3, "-v", "--value"], "Variable name"),
							await CLI.getArgument(["-a", "--application"], ["Application", "*", "all applications", null]),
							await CLI.getArgument(["-e", "--env"], ["Environnement", "*", "all envs", null]),
						);
		
						return process.exit(0);
					}

					case "list": {
						const vars = await (await Client.getActiveClient()).variables.list(
							await CLI.getArgument(["-a", "--application"], ["Application", "*", "all applications", null]),
							await CLI.getArgument(["-e", "--env"], ["Environnement", "*", "all envs", null]),
						);

						new Logger("var list").table(vars);
		
						return process.exit(0);
					}
				}
			}

			case "instance": {
				switch (parameters.shift()) {
					case "list": {
						await (await Client.getActiveClient()).instances.printList(
							await CLI.getArgument(["-a", "--application"], ["Application", "*", "all applications", null]),
							await CLI.getArgument(["-e", "--env"], ["Environnement", "*", "all envs", null]),
						);

						return process.exit();
					}

					case "restart": {
						const client = await Client.getActiveClient();
						const application = await CLI.getArgument(["-a", "--application"], ["Application", "*", "all applications", null]);
						const env = await CLI.getArgument(["-e", "--env"], ["Environnement", "*", "all envs", null]);

						const logger = new Logger("restart");

						await logger.process(["restarting ", logger.ae(application || "*", env || "*")], async done => {
							const count = await client.instances.restart(application, env);

							done("restarted ", count, " instances of ", logger.ae(application || "*", env || "*"));
						});

						return process.exit();
					}

					case "scale": {
						const client = await Client.getActiveClient();
						const application = await CLI.getArgument(["-a", "--application"], "Application");
						const env = await CLI.getArgument(["-e", "--env"], "Environnement");
						const count = +(await CLI.getArgument(["-i", "--instances"], "Number of instances"));

						const logger = new Logger("scale");

						await logger.process(["scaling ", logger.ae(application, env)], async done => {
							const difference = await client.instances.scale(application, env, count);

							if (difference > 0) {
								done("started ", count.toString(), " instances of ", logger.ae(application, env));
							} else if (difference < 0) {
								done("stopped ", count.toString(), " instances of ", logger.ae(application, env)); 
							} else {
								done("no instances removed or added, already running ", count.toString(), " instances of ", logger.ae(application, env));
							}
						});

						return process.exit();
					}

					default: {
						console.error("invalid instance command");
						return process.exit(1);
					}
				}
			}

			case "route": {
				switch (parameters.shift()) {
					case "domain": {
						await (await Client.getActiveClient()).route.domain(
							await CLI.getArgument(["-h", "--host"], "Host"),
							+await CLI.getArgument(["-p", "--port"], "Port (default 80)"),
							await CLI.getArgument(["-a", "--application"], "Application"),
							await CLI.getArgument(["-e", "--env"], "Environnement"),
						);
		
						return process.exit(0);
					}

					case "websocket": {
						await (await Client.getActiveClient()).route.webSocket(
							await CLI.getArgument(["-h", "--host"], "Host"),
							+await CLI.getArgument(["-p", "--port"], "Port (default 80)"),
							await CLI.getArgument(["-l", "--location"], "Location (example: /socket)"),
						);

						return process.exit(0);
					}

					default: {
						console.error("invalid route command");
						return process.exit(1);
					}
				}
			}

			case "ssl": {
				switch (parameters.shift()) {
					case "enable": {
						await (await Client.getActiveClient()).ssl.enable(
							await CLI.getArgument(["-h", "--host"], "Host"),
							+await CLI.getArgument(["-p", "--port"], "Port (default 443)"),
						);

						return process.exit(0);
					}

					default: {
						console.error("invalid ssl command");

						return process.exit(1);
					}
				}
			}

			case "system": {
				console.log(`cluster root: ${Cluster.rootDirectory}`);
				console.log(`arguments:`);

				for (let arg of process.argv) {
					console.log(`\t${arg}`);
				}

				console.log(`platform: ${process.platform}`);
				console.log(`env:`);

				for (let env in process.env) {
					console.log(`\t${env}: ${process.env[env]}`);
				}

				break;
			}

			case "daemon": {
				switch (parameters.shift()) {
					case "install": {
						const daemon = new Daemon();
						await daemon.install(
							await CLI.getArgument(["-u", "--user"], "User")
						);

						console.log("installed and started daemon!");
						console.log("you can check the daemons output with 'journalctl -u vlcluster -f --output cat'");

						break;
					}

					default: {
						const daemon = new Daemon();
						daemon.start();
					}
				}

				break;
			}

			default: {
				console.error("invalid vlcluster command");
				return process.exit(1);
			}
		}
	} catch (e) {
		process.stderr.write(`\x1b[48;5;160m\x1b[38;5;231m${e.message}\x1b[0m\n\x1b[38;5;160m${e.stack}\x1b[0m\n`);

		process.exit(1);
	}
}