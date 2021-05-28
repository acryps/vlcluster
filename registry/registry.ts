import * as fs from "fs";
import { Logger } from "../shared/log";
import { RegistryPath } from "./paths";
import { CreateRegistryController } from "./controllers/create";
import { DeployRegistryController } from "./controllers/deploy";
import { InstancesRegistryController } from "./controllers/instances";
import { VariablesRegistryController } from "./controllers/variables";
import { SSLRegistryController } from "./controllers/ssl";
import { RouteRegistryController } from "./controllers/route";

export class RegistryServer {
	key: string;
	logger: Logger = new Logger("registry");

	create = new CreateRegistryController(this);
	deploy = new DeployRegistryController(this);
	instances = new InstancesRegistryController(this);
	variables = new VariablesRegistryController(this);
	ssl = new SSLRegistryController(this);
	route = new RouteRegistryController(this);

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
		this.ssl.register(app);
		this.route.register(app);
	}
}