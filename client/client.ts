import * as fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import { Cluster } from "../cluster";

export class Client {
	static async create(username: string, host: string, key: string) {
		console.log(`[ client] logging into ${host}...`);

		const result = await fetch(`http://${host}:${Cluster.port}${Cluster.api.registry.createClient}`, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				key,
				username
			})
		}).then(r => r.json());

		console.log(`[ client ] welcome to '${result.name}'!`);

		if (!fs.existsSync(Client.clusterDirectory(result.name))) {
			fs.mkdirSync(Client.clusterDirectory(result.name));
		}

		fs.writeFileSync(Client.clusterKeyFile(result.name), result.key);
		fs.writeFileSync(Client.clusterUsernameFile(result.name), username);

		return {
			name: result.name
		};
	}

	static clusterDirectory(name: string) {
		return path.join(Cluster.clustersDirectory, name);
	}

	static clusterKeyFile(name: string) {
		return path.join(this.clusterDirectory(name), "key");
	}

	static clusterUsernameFile(name: string) {
		return path.join(this.clusterDirectory(name), "username");
	}
}