import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { RegistryServer } from "./registry/registry";
import { Cluster } from "./cluster";
import { Daemon } from "./daemon";
import { WorkerServer } from "./worker/worker";

export async function main() {
	let parameters = process.argv.slice(2);
	Cluster.rootDirectory = path.resolve(os.homedir(), ".vlcluster");

	if (!fs.existsSync(Cluster.rootDirectory)) {
		fs.mkdirSync(Cluster.rootDirectory);
	}

	console.log(parameters);

	try {
		switch (parameters.shift()) {
			case "init": {
				switch (parameters.shift()) {
					case "registry": {
						const key = await RegistryServer.create(parameters[0]);

						console.log(`created registry!\n\nprivate key: ${key}\nStore this key safely!`);
						return process.exit(0);
					}

					case "worker": {
						const registry = await WorkerServer.create(parameters[0], parameters[1]);
						
						console.log(`created worker!\n\nwelcome to '${registry.name}'!`);
					}
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