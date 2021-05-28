import * as fs from "fs";

import { Cluster } from "../shared/cluster";
import { Logger } from "../shared/log";
import { InstancesClientController } from "./controllers/instances";
import { Request } from "../shared/request";
import { ClientPath } from "./paths";
import { DeployClientController } from "./controllers/deploy";
import { RouteClientController } from "./controllers/route";
import { SSLClientController } from "./controllers/ssl";
import { VariablesClientController } from "./controllers/variables";

export class Client {
	host: string;
	key: string;
	username: string;

	deploy = new DeployClientController(this);
	instances = new InstancesClientController(this);
	route = new RouteClientController(this);
	ssl = new SSLClientController(this);
	variables = new VariablesClientController(this);

	constructor(public clusterName: string) {
		if (!Client.hasCluster(clusterName)) {
			throw new Error(`Cluster '${clusterName}' not found!`);
		}

		this.host = fs.readFileSync(ClientPath.clusterHostFile(clusterName)).toString();
		this.key = fs.readFileSync(ClientPath.clusterKeyFile(clusterName)).toString();
		this.username = fs.readFileSync(ClientPath.clusterUsernameFile(clusterName)).toString();
	}

	static hasCluster(name: string) {
		return fs.existsSync(ClientPath.clusterDirectory(name));
	}

	static async create(username: string, host: string, key: string) {
		const logger = new Logger("login");

		logger.log("logging into ", host, "...");

		const result = await new Request(host, Cluster.api.registry.create.client)
			.append("username", username)
			.append("key", key)
			.send<{ 
				name: string, 
				key: string 
			}>();

		logger.log("welcome to ", logger.c(result.name), "!");

		if (!fs.existsSync(ClientPath.clusterDirectory(result.name))) {
			fs.mkdirSync(ClientPath.clusterDirectory(result.name));
		}

		fs.writeFileSync(ClientPath.clusterKeyFile(result.name), result.key);
		fs.writeFileSync(ClientPath.clusterUsernameFile(result.name), username);
		fs.writeFileSync(ClientPath.clusterHostFile(result.name), host);

		return {
			name: result.name
		};
	}
}