import { Crypto } from "../shared/crypto";
import { Cluster } from "../shared/cluster";
import * as fetch from "node-fetch";
import * as fs from "fs";
import { Logger } from "../log";
import { ChildInstance, ChildWorker } from "./worker";
import { RegistryPath } from "./paths";
import { StartRequest } from "./messages/start";
import { StopRequest } from "./messages/stop";
import { threadId } from "worker_threads";
import { CreateRegistryController } from "./controllers/create";
import { DeployRegistryController } from "./controllers/deploy";
import { InstancesRegistryController } from "./controllers/instances";
import { VariablesRegistryController } from "./controllers/variables";
import { SSLRegistryController } from "./controllers/ssl";
import { MapRegistryController } from "./controllers/map";

export class RegistryServer {
	key: string;
	logger: Logger = new Logger("registry");

	create = new CreateRegistryController(this);
	deploy = new DeployRegistryController(this);
	instances = new InstancesRegistryController(this);
	variables = new VariablesRegistryController(this);
	ssl = new SSLRegistryController(this);
	map = new MapRegistryController(this);

	constructor() {
		if (!RegistryServer.isInstalled()) {
			throw new Error("no registry installed on this host!");
		}

		this.key = fs.readFileSync(RegistryPath.keyFile).toString();
	}

	static isInstalled() {
		return fs.existsSync(RegistryPath.rootDirectory);
	}

	get name() {
		return fs.readFileSync(RegistryPath.nameFile).toString();
	}

	register(app) {
		this.create.register(app);
		this.deploy.register(app);
		this.instances.register(app);
		this.variables.register(app);
	}
}