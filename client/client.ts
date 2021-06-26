import * as fs from "fs";

import { Cluster } from "../shared/cluster";
import { Logger } from "../shared/log";
import { InstancesClientController } from "./controllers/instances";
import { Request } from "../shared/request";
import { DeployClientController } from "./controllers/deploy";
import { RouteClientController } from "./controllers/route";
import { SSLClientController } from "./controllers/ssl";
import { VariablesClientController } from "./controllers/variables";
import { ClientConfiguration } from "./configuration";
import { Configuration } from "../shared/configuration";
import { CLI } from "../cli";

export class Client {
	deploy = new DeployClientController(this);
	instances = new InstancesClientController(this);
	route = new RouteClientController(this);
	ssl = new SSLClientController(this);
	variables = new VariablesClientController(this);

	constructor(public configuration: ClientConfiguration) {}

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

		const config: ClientConfiguration = {
			name: username,
			host,
			key: result.key,
			clusterName: result.name
		};

		Configuration.clients.push(config);
		Configuration.save();

		return {
			name: result.name
		};
	}

	static async getActiveClient() {
		const cluster = await CLI.getClusterName();

		return new Client(Configuration.clients.find(c => c.clusterName == cluster));
	}
}