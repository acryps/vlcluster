import * as fs from "fs";
import * as path from "path";
import { Logger } from "../shared/log";
import { CreateRegistryController } from "./controllers/create";
import { DeployRegistryController } from "./controllers/deploy";
import { InstancesRegistryController } from "./controllers/instances";
import { VariablesRegistryController } from "./controllers/variables";
import { SSLRegistryController } from "./controllers/ssl";
import { RouteRegistryController } from "./controllers/route";
import { RegistryConfiguration } from "./configuration";
import { Cluster } from "../shared/cluster";

export class RegistryServer {
	logger: Logger = new Logger("registry");

	create = new CreateRegistryController(this);
	deploy = new DeployRegistryController(this);
	instances = new InstancesRegistryController(this);
	variables = new VariablesRegistryController(this);
	ssl = new SSLRegistryController(this);
	route = new RouteRegistryController(this);

	constructor(public configuration: RegistryConfiguration) {
		for (let worker of configuration.workers) {
			worker.running = false;
		}

		for (let application of configuration.applications) {
			for (let instance of application.instances) {
				instance.running = false;
				instance.backupOf = null;
				instance.worker = null;
			}
		}
	}

	register(app) {
		this.create.register(app);
		this.deploy.register(app);
		this.instances.register(app);
		this.variables.register(app);
		this.ssl.register(app);
		this.route.register(app);

		this.startup();
	}

	startup() {
		this.logger.log("waiting for ", Math.round(Cluster.startupTime / 1000).toString(), "s for workers to login");

		setTimeout(async () => {
			if (!this.configuration.workers.find(w => w.running)) {
				this.logger.warn("no workers logged in yet! retrying");

				this.startup();

				return;
			}

			this.logger.log(this.configuration.workers.filter(w => w.running).map(w => this.logger.w(w.name)).join(", "), " logged in, starting instances");

			let count = 0;

			for (let application of this.configuration.applications) {
				for (let instance of application.instances) {
					count++;

					await this.instances.start(application, instance.version, instance.env, instance);
				}
			}

			await this.route.updateGateways();

			this.logger.log(`started ${count} instances. cluster `, this.logger.c(this.configuration.name), " ready");
		}, Cluster.startupTime);
	}

	static get imagesDirectory() {
		const directoryPath = path.join(Cluster.rootDirectory, "images");

		if (!fs.existsSync(directoryPath)) {
			fs.mkdirSync(directoryPath);
		}

		return directoryPath;
	}

	static imageLocation(application: string, version: string) {
		if (!fs.existsSync(path.join(this.imagesDirectory, application))) {
			fs.mkdirSync(path.join(this.imagesDirectory, application));
		}

		return path.join(this.imagesDirectory, application, `${version}.app`);
	}
}