import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { RegistryServer } from "./registry/server";

export async function main() {
	let parameters = process.argv.slice(2);
	const root = path.resolve(os.homedir(), ".vlcluster");

	console.log(`[vlc] root ${root}`);

	if (!fs.existsSync(root)) {
		fs.mkdirSync(root);
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