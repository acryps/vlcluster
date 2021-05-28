import { Logger } from "../../shared/log";
import { Crypto } from "../../shared/crypto";
import { RegistryPath } from "../paths";
import { RegistryServer } from "../registry";
import fs = require("fs");
import { Handler } from "../../shared/handler";
import { clearScreenDown } from "readline";
import { Cluster } from "../../shared/cluster";

export class CreateRegistryController {
    logger = new Logger("create");

    constructor(private registry: RegistryServer) {}

    static async registry(name: string) {
		// generate key
		const key = Crypto.createKey();

		// create registry directory
		fs.mkdirSync(RegistryPath.rootDirectory);

		// create files
		fs.writeFileSync(RegistryPath.keyFile, key);
		fs.writeFileSync(RegistryPath.nameFile, name);

		// create registry
		fs.mkdirSync(RegistryPath.workersDirectory);
		fs.mkdirSync(RegistryPath.clientsDirectory);
		fs.mkdirSync(RegistryPath.applicationsDirectory);
		fs.mkdirSync(RegistryPath.routesDirectory);
		fs.mkdirSync(RegistryPath.variablesDirectory);

		return key;
	}

	register(app) {
		new Handler(app, Cluster.api.registry.create.worker, async params => {
			if (this.registry.key != params.key) {
				throw new Error("invalid key login attepted");
			}

			return {
				name: this.registry.name,
				key: await this.worker(params.name)
			};
		});

		new Handler(app, Cluster.api.registry.create.client, async params => {
			if (this.registry.key != params.key) {
				throw new Error("invalid key login attepted");
			}

			return {
				name: this.registry.name,
				key: await this.client(params.username)
			};
		});

		new Handler(app, Cluster.api.registry.create.gateway, async params => {
			if (this.registry.key != params.key) {
				throw new Error("invalid key login attepted");
			}

			return {
				name: this.registry.name,
				key: await this.gateway(params.name, params.host)
			};
		});
	}

    worker(name: string) {
		this.logger.log("creating worker ", this.logger.w(name));

		if (fs.existsSync(RegistryPath.workerDirectory(name))) {
			throw new Error("worker already registered");
		}

		const key = Crypto.createKey();

		fs.mkdirSync(RegistryPath.workerDirectory(name));
		fs.writeFileSync(RegistryPath.workerKeyFile(name), key);

		this.logger.log("created worker ", this.logger.w(name));

		return key;
	}

	client(name: string) {
		const key = Crypto.createKey();

		this.logger.log(`creating client ${name}`);

		if (fs.existsSync(RegistryPath.clientDirectory(name))) {
			throw new Error(`client '${name}' already exists!`);
		}

		fs.mkdirSync(RegistryPath.clientDirectory(name));
		fs.writeFileSync(RegistryPath.clientKeyFile(name), key);

		this.logger.log("created client");

		return key;
	}

	gateway(name: string, host: string) {
		const key = Crypto.createKey();

		this.logger.log(`creating gateway ${name}`);

		if (fs.existsSync(RegistryPath.gatewayDirectory(name))) {
			throw new Error(`gateway '${name}' already exists!`);
		}

		if (!fs.existsSync(RegistryPath.gatewaysDirectory)) {
			fs.mkdirSync(RegistryPath.gatewaysDirectory);
		}

		fs.mkdirSync(RegistryPath.gatewayDirectory(name));
		fs.writeFileSync(RegistryPath.gatewayHostFile(name), host);
		fs.writeFileSync(RegistryPath.gatewayKeyFile(name), key);

		this.logger.log("created gateway");

		return key;
	}
}