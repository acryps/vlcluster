import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { RegistryServer } from "./registry/server";
import { Cluster } from "./cluster";

export async function main() {
	let parameters = process.argv.slice(2);
	Cluster.rootDirectory = path.resolve(os.homedir(), ".vlcluster");

	if (!fs.existsSync(Cluster.rootDirectory)) {
		fs.mkdirSync(Cluster.rootDirectory);
	}

	console.log(parameters);

	switch (parameters.shift()) {
		case "init": {
			switch (parameters.shift()) {
				case "registry": {
					const key = await RegistryServer.create();

					console.log(`created registry with key: ${key}. Store this key safely!`);
					return process.exit(0);
				}
			}
		}
	}
}