import { Crypto } from "../crypto";
import { Cluster } from "../cluster";
import * as fs from "fs";
import * as path from "path";

export class RegistryServer {
	static async create() {
		const key = Crypto.createKey();

		fs.writeFileSync(path.join(Cluster.localDirectory, "registry"), JSON.stringify({
			key
		}));

		return key;
	}
}